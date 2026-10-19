"use client";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export type Entry = {
  entryDate: string;
  weightLb: number | null;
  bodyFatPct: number | null;
  benchLb: number | null;
  squatLb: number | null;
  deadliftLb: number | null;
};

const AXIS = { stroke: "#9aa7c7", fontSize: 12 };
const GRID = "#243059";
const TIP = { background: "#0e1630", border: "1px solid #243059", borderRadius: 10, color: "#eaf0ff" };
const short = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function BodyChart({ entries }: { entries: Entry[] }) {
  const data = entries.filter((e) => e.weightLb !== null || e.bodyFatPct !== null);
  if (data.length < 2) return <div className="empty">Log at least two check-ins to see a trend.</div>;
  return (
    <div className="chart-box" role="img" aria-label="Line chart of body weight and body fat percentage over time">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="entryDate" tickFormatter={short} {...AXIS} />
          <YAxis yAxisId="w" allowDecimals={false} domain={[(m: number) => Math.floor(m - 3), (m: number) => Math.ceil(m + 3)]} {...AXIS} />
          <YAxis yAxisId="bf" orientation="right" allowDecimals={false} domain={[(m: number) => Math.floor(m - 2), (m: number) => Math.ceil(m + 2)]} {...AXIS} />
          <Tooltip contentStyle={TIP} labelFormatter={(l) => short(String(l))} />
          <Legend />
          <Line yAxisId="w" type="monotone" dataKey="weightLb" name="Weight (lb)" stroke="#ff8a45" strokeWidth={3} dot={{ r: 3 }} connectNulls />
          <Line yAxisId="bf" type="monotone" dataKey="bodyFatPct" name="Body fat (%)" stroke="#6ea8ff" strokeWidth={3} dot={{ r: 3 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StrengthChart({ entries }: { entries: Entry[] }) {
  const data = entries.filter((e) => e.benchLb !== null || e.squatLb !== null || e.deadliftLb !== null);
  if (data.length < 2) return <div className="empty">No strength data yet. Log your big lifts to chart them.</div>;
  return (
    <div className="chart-box" role="img" aria-label="Line chart of bench, squat and deadlift weights over time">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="entryDate" tickFormatter={short} {...AXIS} />
          <YAxis {...AXIS} />
          <Tooltip contentStyle={TIP} labelFormatter={(l) => short(String(l))} />
          <Legend />
          <Line type="monotone" dataKey="benchLb" name="Bench (lb)" stroke="#ff8a45" strokeWidth={3} dot={{ r: 3 }} connectNulls />
          <Line type="monotone" dataKey="squatLb" name="Squat (lb)" stroke="#6ea8ff" strokeWidth={3} dot={{ r: 3 }} connectNulls />
          <Line type="monotone" dataKey="deadliftLb" name="Deadlift (lb)" stroke="#a3e635" strokeWidth={3} dot={{ r: 3 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RevenueChart({ data }: { data: { month: string; revenue: number }[] }) {
  return (
    <div className="chart-box" style={{ height: 260 }} role="img" aria-label="Bar chart of paid revenue by month">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" {...AXIS} />
          <YAxis tickFormatter={(v) => `$${v}`} {...AXIS} />
          <Tooltip contentStyle={TIP} formatter={(v) => [`$${Number(v).toLocaleString()}`, "Paid"]} cursor={{ fill: "rgba(255,255,255,.04)" }} />
          <Bar dataKey="revenue" fill="#ff6b1a" radius={[6, 6, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
