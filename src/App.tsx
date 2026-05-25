import { FormEvent, useEffect, useMemo, useState } from "react";

type CoinSymbol = "BTC" | "ETH" | "SOL";

type CoinPrice = {
  usd: number;
  usd_24h_change?: number;
};

type CoinPriceMap = Partial<Record<CoinSymbol, CoinPrice>>;

type Trade = {
  id: string;
  createdAt: string;
  coin: CoinSymbol;
  side: "Long" | "Short";
  accountSize: number;
  entryPrice: number;
  stopPrice: number;
  riskAmount: number;
  unitRisk: number;
  units: number;
  notional: number;
  note: string;
};

const COINS: Array<{
  id: string;
  symbol: CoinSymbol;
  name: string;
  accent: string;
  glow: string;
  gradient: string;
}> = [
  {
    id: "bitcoin",
    symbol: "BTC",
    name: "Bitcoin",
    accent: "text-amber-300",
    glow: "shadow-amber-500/20",
    gradient: "from-amber-400 via-orange-500 to-rose-500",
  },
  {
    id: "ethereum",
    symbol: "ETH",
    name: "Ethereum",
    accent: "text-cyan-300",
    glow: "shadow-cyan-500/20",
    gradient: "from-cyan-300 via-blue-500 to-violet-500",
  },
  {
    id: "solana",
    symbol: "SOL",
    name: "Solana",
    accent: "text-fuchsia-300",
    glow: "shadow-fuchsia-500/20",
    gradient: "from-emerald-300 via-fuchsia-500 to-violet-600",
  },
];

const coinBySymbol = COINS.reduce(
  (acc, coin) => ({ ...acc, [coin.symbol]: coin }),
  {} as Record<CoinSymbol, (typeof COINS)[number]>,
);

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const compactCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 6,
});

function formatCurrency(value: number, compact = false) {
  if (!Number.isFinite(value)) {
    return "$0.00";
  }

  return compact
    ? compactCurrencyFormatter.format(value)
    : currencyFormatter.format(value);
}

function parsePositiveNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function loadTrades() {
  try {
    const rawTrades = window.localStorage.getItem("crypto-dashboard-trades");
    if (!rawTrades) {
      return [];
    }

    return JSON.parse(rawTrades) as Trade[];
  } catch {
    return [];
  }
}

function calculateFutureValue(
  monthlyContribution: number,
  annualReturnPercent: number,
  years: number,
) {
  const months = Math.max(0, Math.round(years * 12));
  const monthlyReturn = annualReturnPercent / 100 / 12;

  if (months === 0 || monthlyContribution <= 0) {
    return 0;
  }

  if (monthlyReturn === 0) {
    return monthlyContribution * months;
  }

  return (
    monthlyContribution *
    (((1 + monthlyReturn) ** months - 1) / monthlyReturn)
  );
}

function useLivePrices() {
  const [prices, setPrices] = useState<CoinPriceMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function fetchPrices(signal?: AbortSignal) {
    setIsLoading(true);
    setError(null);

    const ids = COINS.map((coin) => coin.id).join(",");
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;

    try {
      const response = await fetch(url, { signal });

      if (!response.ok) {
        throw new Error(`CoinGecko returned ${response.status}`);
      }

      const data = (await response.json()) as Record<string, CoinPrice>;
      const nextPrices = COINS.reduce<CoinPriceMap>((acc, coin) => {
        const price = data[coin.id];
        if (price) {
          acc[coin.symbol] = price;
        }
        return acc;
      }, {});

      setPrices(nextPrices);
      setLastUpdated(new Date());
    } catch (requestError) {
      if ((requestError as Error).name !== "AbortError") {
        setError("Live prices are temporarily unavailable. Try refreshing.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void fetchPrices(controller.signal);

    const intervalId = window.setInterval(() => {
      void fetchPrices();
    }, 60_000);

    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, []);

  return { prices, isLoading, error, lastUpdated, refresh: fetchPrices };
}

function App() {
  const { prices, isLoading, error, lastUpdated, refresh } = useLivePrices();

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-50">
      <div className="orb pointer-events-none absolute left-[-10rem] top-[-8rem] h-96 w-96 rounded-full bg-cyan-500/20 blur-3xl" />
      <div className="orb pointer-events-none absolute right-[-8rem] top-32 h-[28rem] w-[28rem] rounded-full bg-fuchsia-500/20 blur-3xl [animation-delay:-4s]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />

      <section className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10">
        <Hero
          isLoading={isLoading}
          lastUpdated={lastUpdated}
          onRefresh={() => void refresh()}
        />

        {error ? (
          <div className="rounded-3xl border border-rose-400/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-100 shadow-2xl shadow-rose-950/40">
            {error}
          </div>
        ) : null}

        <PriceGrid prices={prices} isLoading={isLoading} />

        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
          <DcaCalculator prices={prices} />
          <TradingDiary prices={prices} />
        </div>
      </section>
    </main>
  );
}

function Hero({
  isLoading,
  lastUpdated,
  onRefresh,
}: {
  isLoading: boolean;
  lastUpdated: Date | null;
  onRefresh: () => void;
}) {
  return (
    <header className="grid gap-6 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-cyan-950/30 backdrop-blur md:grid-cols-[1fr_auto] md:items-end lg:p-8">
      <div>
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-cyan-200">
          Business crypto treasury desk
        </div>
        <h1 className="max-w-4xl text-4xl font-black tracking-tight text-white sm:text-6xl lg:text-7xl">
          Manage treasury exposure.
          <span className="block bg-gradient-to-r from-cyan-200 via-fuchsia-300 to-amber-200 bg-clip-text text-transparent">
            Allocate with controls.
          </span>
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
          Monitor live BTC, ETH, and SOL markets, model recurring treasury
          allocations, and size tactical entries from a strict 1% capital-risk
          policy.
        </p>
      </div>

      <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-4">
        <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
          Market feed
        </p>
        <p className="mt-2 text-sm text-slate-300">
          {lastUpdated
            ? `Updated ${lastUpdated.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : "Waiting for first quote"}
        </p>
        <button
          className="mt-4 w-full rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-950 transition hover:scale-[1.02] hover:bg-cyan-100 disabled:cursor-wait disabled:opacity-60"
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
        >
          {isLoading ? "Refreshing..." : "Refresh prices"}
        </button>
      </div>
    </header>
  );
}

function PriceGrid({
  prices,
  isLoading,
}: {
  prices: CoinPriceMap;
  isLoading: boolean;
}) {
  return (
    <section className="grid gap-5 md:grid-cols-3">
      {COINS.map((coin) => {
        const price = prices[coin.symbol];
        const change = price?.usd_24h_change ?? 0;
        const isPositive = change >= 0;

        return (
          <article
            className={`relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900/80 p-6 shadow-2xl ${coin.glow}`}
            key={coin.symbol}
          >
            <div
              className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${coin.gradient}`}
            />
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={`text-sm font-bold ${coin.accent}`}>
                  {coin.name}
                </p>
                <h2 className="mt-2 text-3xl font-black">{coin.symbol}</h2>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
                Live
              </div>
            </div>
            <p className="mt-8 text-4xl font-black tracking-tight">
              {price ? formatCurrency(price.usd) : isLoading ? "..." : "--"}
            </p>
            <p
              className={`mt-3 text-sm font-semibold ${
                isPositive ? "text-emerald-300" : "text-rose-300"
              }`}
            >
              {price
                ? `${isPositive ? "+" : ""}${change.toFixed(2)}% over 24h`
                : "Price pending"}
            </p>
          </article>
        );
      })}
    </section>
  );
}

function DcaCalculator({ prices }: { prices: CoinPriceMap }) {
  const [monthlyAmount, setMonthlyAmount] = useState("500");
  const [selectedCoin, setSelectedCoin] = useState<CoinSymbol>("BTC");
  const [years, setYears] = useState("10");
  const [annualReturn, setAnnualReturn] = useState("12");

  const projection = useMemo(() => {
    const monthly = parsePositiveNumber(monthlyAmount);
    const horizonYears = parsePositiveNumber(years);
    const assumedReturn = Number(annualReturn);
    const annualPercent = Number.isFinite(assumedReturn) ? assumedReturn : 0;
    const invested = monthly * horizonYears * 12;
    const futureValue = calculateFutureValue(
      monthly,
      annualPercent,
      horizonYears,
    );
    const price = prices[selectedCoin]?.usd ?? 0;
    const approximateCoins = price > 0 ? invested / price : 0;
    const milestones = [1, 3, 5, 10, 15]
      .filter((year) => year <= horizonYears)
      .concat(horizonYears)
      .filter((year, index, allYears) => allYears.indexOf(year) === index)
      .map((year) => ({
        year,
        invested: monthly * year * 12,
        value: calculateFutureValue(monthly, annualPercent, year),
      }));

    return {
      monthly,
      horizonYears,
      annualPercent,
      invested,
      futureValue,
      growth: futureValue - invested,
      approximateCoins,
      milestones,
    };
  }, [annualReturn, monthlyAmount, prices, selectedCoin, years]);

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-slate-950/50 backdrop-blur">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-cyan-200">
            Treasury allocation model
          </p>
          <h2 className="mt-3 text-3xl font-black text-white">
            Plan corporate digital asset exposure
          </h2>
        </div>
        <div className="rounded-2xl bg-cyan-300/10 px-4 py-3 text-sm font-semibold text-cyan-100">
          Scenario model for internal planning
        </div>
      </div>

      <div className="mt-7 grid gap-4 md:grid-cols-2">
        <InputField
          id="monthly-amount"
          label="Monthly allocation budget"
          prefix="$"
          value={monthlyAmount}
          onChange={setMonthlyAmount}
        />
        <SelectField
          id="dca-coin"
          label="Coin"
          value={selectedCoin}
          onChange={(value) => setSelectedCoin(value as CoinSymbol)}
        />
        <InputField
          id="projection-years"
          label="Planning horizon"
          suffix="years"
          value={years}
          onChange={setYears}
        />
        <InputField
          id="annual-return"
          label="Assumed annual growth"
          suffix="%"
          value={annualReturn}
          onChange={setAnnualReturn}
          allowNegative
        />
      </div>

      <div className="mt-7 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Capital deployed"
          value={formatCurrency(projection.invested, true)}
        />
        <StatCard
          label="Projected treasury value"
          value={formatCurrency(projection.futureValue, true)}
          highlight
        />
        <StatCard
          label="Scenario upside"
          value={formatCurrency(projection.growth, true)}
        />
      </div>

      <div className="mt-7 rounded-3xl border border-white/10 bg-slate-950/70 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-slate-400">
              Estimated {selectedCoin} exposure at today's spot price
            </p>
            <p className={`mt-1 text-2xl font-black ${coinBySymbol[selectedCoin].accent}`}>
              {numberFormatter.format(projection.approximateCoins)}{" "}
              {selectedCoin}
            </p>
          </div>
          <p className="text-sm text-slate-500">
            Spot:{" "}
            {prices[selectedCoin]?.usd
              ? formatCurrency(prices[selectedCoin]!.usd)
              : "waiting for quote"}
          </p>
        </div>

        <div className="mt-5 space-y-3">
          {projection.milestones.map((milestone) => {
            const progress =
              projection.futureValue > 0
                ? Math.min(100, (milestone.value / projection.futureValue) * 100)
                : 0;

            return (
              <div key={milestone.year}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-200">
                    Year {milestone.year}
                  </span>
                  <span className="text-slate-400">
                    {formatCurrency(milestone.value, true)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${coinBySymbol[selectedCoin].gradient}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TradingDiary({ prices }: { prices: CoinPriceMap }) {
  const [trades, setTrades] = useState<Trade[]>(loadTrades);
  const [accountSize, setAccountSize] = useState("10000");
  const [coin, setCoin] = useState<CoinSymbol>("BTC");
  const [side, setSide] = useState<"Long" | "Short">("Long");
  const [entryPrice, setEntryPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    window.localStorage.setItem(
      "crypto-dashboard-trades",
      JSON.stringify(trades),
    );
  }, [trades]);

  const sizing = useMemo(() => {
    const account = parsePositiveNumber(accountSize);
    const entry = parsePositiveNumber(entryPrice);
    const stop = parsePositiveNumber(stopPrice);
    const riskAmount = account * 0.01;
    const unitRisk = Math.abs(entry - stop);
    const units = unitRisk > 0 ? riskAmount / unitRisk : 0;
    const notional = units * entry;
    const validStopDirection =
      side === "Long" ? stop > 0 && stop < entry : stop > entry;

    return {
      account,
      entry,
      stop,
      riskAmount,
      unitRisk,
      units,
      notional,
      validStopDirection,
      canSave: account > 0 && entry > 0 && stop > 0 && unitRisk > 0,
    };
  }, [accountSize, entryPrice, side, stopPrice]);

  function saveTrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!sizing.canSave) {
      return;
    }

    const nextTrade: Trade = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      coin,
      side,
      accountSize: sizing.account,
      entryPrice: sizing.entry,
      stopPrice: sizing.stop,
      riskAmount: sizing.riskAmount,
      unitRisk: sizing.unitRisk,
      units: sizing.units,
      notional: sizing.notional,
      note,
    };

    setTrades((currentTrades) => [nextTrade, ...currentTrades]);
    setEntryPrice("");
    setStopPrice("");
    setNote("");
  }

  const totalRisk = trades.reduce((sum, trade) => sum + trade.riskAmount, 0);

  return (
    <section className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-fuchsia-950/30">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-fuchsia-200">
          Execution risk register
        </p>
        <h2 className="mt-3 text-3xl font-black text-white">
          Record tactical entries with a 1% risk cap
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Position size is calculated as capital at risk divided by the distance
          between entry and stop. The risk budget is always 1% of treasury
          account value.
        </p>
      </div>

      <form className="mt-7 grid gap-4" onSubmit={saveTrade}>
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField
            id="account-size"
            label="Treasury account value"
            prefix="$"
            value={accountSize}
            onChange={setAccountSize}
          />
          <SelectField
            id="trade-coin"
            label="Coin"
            value={coin}
            onChange={(value) => setCoin(value as CoinSymbol)}
          />
          <label className="grid gap-2 text-sm font-semibold text-slate-300">
            Direction
            <select
              className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none transition focus:border-fuchsia-300"
              value={side}
              onChange={(event) =>
                setSide(event.target.value as "Long" | "Short")
              }
            >
              <option>Long</option>
              <option>Short</option>
            </select>
          </label>
          <div className="grid content-end">
            <button
              className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              disabled={!prices[coin]?.usd}
              onClick={() => setEntryPrice(String(prices[coin]?.usd ?? ""))}
            >
              Use live {coin} price
            </button>
          </div>
          <InputField
            id="entry-price"
            label="Entry price"
            prefix="$"
            value={entryPrice}
            onChange={setEntryPrice}
          />
          <InputField
            id="stop-price"
            label="Stop price"
            prefix="$"
            value={stopPrice}
            onChange={setStopPrice}
          />
        </div>

        <label className="grid gap-2 text-sm font-semibold text-slate-300">
          Business rationale / notes
          <textarea
            className="min-h-24 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-fuchsia-300"
            placeholder="Mandate, invalidation, catalyst, approval notes..."
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>

        {!sizing.validStopDirection && sizing.stop > 0 && sizing.entry > 0 ? (
          <p className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
            Check the stop direction: long exposure usually uses stops below entry,
            while short exposure usually uses stops above entry.
          </p>
        ) : null}

        <div className="grid gap-4 rounded-3xl border border-white/10 bg-slate-950/70 p-5 sm:grid-cols-3">
          <StatCard label="1% capital risk" value={formatCurrency(sizing.riskAmount)} />
          <StatCard
            label="Position size"
            value={`${numberFormatter.format(sizing.units)} ${coin}`}
            highlight
          />
          <StatCard label="Exposure notional" value={formatCurrency(sizing.notional)} />
        </div>

        <button
          className="rounded-2xl bg-gradient-to-r from-cyan-300 via-fuchsia-300 to-amber-200 px-5 py-4 text-sm font-black uppercase tracking-[0.2em] text-slate-950 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
          type="submit"
          disabled={!sizing.canSave}
        >
          Log execution
        </button>
      </form>

      <div className="mt-7">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-black text-white">Recent executions</h3>
          <p className="text-sm text-slate-400">
            Registered risk: {formatCurrency(totalRisk)}
          </p>
        </div>

        {trades.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-sm text-slate-400">
            No executions yet. Add one above to start building the risk register.
          </div>
        ) : (
          <div className="space-y-3">
            {trades.map((trade) => (
              <article
                className="rounded-3xl border border-white/10 bg-slate-950/70 p-5"
                key={trade.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-400">
                      {new Date(trade.createdAt).toLocaleString()}
                    </p>
                    <h4 className="mt-1 text-xl font-black text-white">
                      {trade.side} {trade.coin}
                    </h4>
                  </div>
                  <button
                    className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-slate-400 transition hover:border-rose-300/40 hover:text-rose-200"
                    type="button"
                    onClick={() =>
                      setTrades((currentTrades) =>
                        currentTrades.filter(
                          (currentTrade) => currentTrade.id !== trade.id,
                        ),
                      )
                    }
                  >
                    Delete
                  </button>
                </div>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <DiaryMetric label="Entry" value={formatCurrency(trade.entryPrice)} />
                  <DiaryMetric label="Stop" value={formatCurrency(trade.stopPrice)} />
                  <DiaryMetric
                    label="Size"
                    value={`${numberFormatter.format(trade.units)} ${trade.coin}`}
                  />
                  <DiaryMetric
                    label="Risk"
                    value={`${formatCurrency(trade.riskAmount)} (1%)`}
                  />
                </div>
                {trade.note ? (
                  <p className="mt-4 rounded-2xl bg-white/[0.04] p-3 text-sm leading-6 text-slate-300">
                    {trade.note}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function InputField({
  id,
  label,
  value,
  onChange,
  prefix,
  suffix,
  allowNegative = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  prefix?: string;
  suffix?: string;
  allowNegative?: boolean;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-300" htmlFor={id}>
      {label}
      <div className="flex items-center rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 transition focus-within:border-cyan-300">
        {prefix ? <span className="mr-2 text-slate-500">{prefix}</span> : null}
        <input
          className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-slate-600"
          id={id}
          inputMode="decimal"
          min={allowNegative ? undefined : "0"}
          step="any"
          type="number"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {suffix ? <span className="ml-2 text-slate-500">{suffix}</span> : null}
      </div>
    </label>
  );
}

function SelectField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: CoinSymbol;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-300" htmlFor={id}>
      {label}
      <select
        className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {COINS.map((coin) => (
          <option key={coin.symbol} value={coin.symbol}>
            {coin.name} ({coin.symbol})
          </option>
        ))}
      </select>
    </label>
  );
}

function StatCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl border p-4 ${
        highlight
          ? "border-cyan-300/30 bg-cyan-300/10"
          : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
    </div>
  );
}

function DiaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 font-bold text-slate-100">{value}</p>
    </div>
  );
}

export { App };
