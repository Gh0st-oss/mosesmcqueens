import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Role =
  | "General Manager"
  | "Manager"
  | "Lead"
  | "Bartender"
  | "Bar Back"
  | "Back of House";

type View =
  | "dashboard"
  | "schedule"
  | "sidework"
  | "availability"
  | "requestOff"
  | "tradeShifts"
  | "approvals"
  | "staff";

type WeekKey = "previous" | "current" | "next";

type StaffPermissions = {
  schedule: boolean;
  sidework: boolean;
  approvals: boolean;
  staff: boolean;
  cloudSync: boolean;
};

type StaffMember = {
  id: number;
  name: string;
  role: Role;
  pin: string;
  active: boolean;
  permissions?: StaffPermissions;
};

type ShiftTemplate = {
  id: number;
  name: string;
  time: string;
  sideworkWindow: "Open" | "Mid" | "Close";
  active?: boolean;
};

type ShiftRow = {
  id: number;
  day: string;
  dateLabel: string;
  shift: string;
  time: string;
  employee: string;
  sideworkWindow?: "Open" | "Mid" | "Close";
};

type SideworkItem = {
  id: number;
  task: string;
  team: string;
  assignedTo: string;
  shiftWindow: string;
  active: boolean;
};

type SideworkState = Record<Role, SideworkItem[]>;

type SideworkCompletion = {
  completed: boolean;
  completedBy: string | null;
  completedAt: string | null;
  status?: "pending" | "completed" | "missed";
  note?: string;
};

type SideworkLog = {
  id: number;
  task: string;
  employee: string;
  role: Role;
  shift: string;
  completed: boolean;
  note: string;
  timestamp: string;
};

type MissedTaskDraft = {
  itemId: number | null;
  note: string;
};

type AvailabilityRequest = {
  id: number;
  employee: string;
  day: string;
  restriction: string;
  status: string;
};

type RequestOff = {
  id: number;
  employee: string;
  date: string;
  shift: string;
  note: string;
  status: string;
};

type TradeRequest = {
  id: number;
  employee: string;
  tradeWith: string;
  shiftId: number;
  requestedShift: string;
  note: string;
  status: string;
};

type CalendarDate = {
  day: string;
  dateLabel: string;
};

type ScheduleAlert = {
  availabilityIssue: string | null;
  requestOffIssue: string | null;
  doubleBooked: boolean;
};

type PublishMeta = {
  lastPublishedAt: string | null;
};

const ROLES: Role[] = [
  "General Manager",
  "Manager",
  "Lead",
  "Bartender",
  "Bar Back",
  "Back of House",
];

const DEFAULT_PERMISSIONS: StaffPermissions = {
  schedule: false,
  sidework: false,
  approvals: false,
  staff: false,
  cloudSync: false,
};

const MANAGER_PERMISSIONS: StaffPermissions = {
  schedule: true,
  sidework: true,
  approvals: true,
  staff: false,
  cloudSync: false,
};

const GM_PERMISSIONS: StaffPermissions = {
  schedule: true,
  sidework: true,
  approvals: true,
  staff: true,
  cloudSync: true,
};

function getDefaultPermissionsForRole(role: Role): StaffPermissions {
  if (role === "General Manager") return { ...GM_PERMISSIONS };
  if (role === "Manager") return { ...MANAGER_PERMISSIONS };
  return { ...DEFAULT_PERMISSIONS };
}

const STAFF_SEED: StaffMember[] = [
  { id: 1, name: "Jay", role: "Bartender", pin: "1234", active: true, permissions: getDefaultPermissionsForRole("Bartender") },
  { id: 2, name: "Dawn", role: "Bartender", pin: "4321", active: true, permissions: getDefaultPermissionsForRole("Bartender") },
  { id: 3, name: "Chris", role: "Manager", pin: "5678", active: true, permissions: getDefaultPermissionsForRole("Manager") },
];

const DEFAULT_SHIFT_TEMPLATES: ShiftTemplate[] = [
  { id: 1, name: "Open", time: "9:00 AM - 5:00 PM", sideworkWindow: "Open", active: true },
  { id: 2, name: "Mid", time: "12:00 PM - 8:00 PM", sideworkWindow: "Mid", active: true },
  { id: 3, name: "Close", time: "5:00 PM - 1:00 AM", sideworkWindow: "Close", active: true },
];

const WEEK_DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function getMondayStart(date = new Date()) {
  const current = new Date(date);
  current.setHours(0, 0, 0, 0);
  const day = current.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  current.setDate(current.getDate() + diff);
  return current;
}

function formatDateLabel(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatFullDateTime(date: Date) {
  return date.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getCurrentPayPeriod(date = new Date()) {
  const anchorPayday = new Date("2026-05-08T00:00:00");
  const current = new Date(date);
  current.setHours(0, 0, 0, 0);

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysSinceAnchor = Math.floor((current.getTime() - anchorPayday.getTime()) / msPerDay);
  const periodsSinceAnchor = Math.floor(daysSinceAnchor / 14);

  const start = new Date(anchorPayday);
  start.setDate(anchorPayday.getDate() + periodsSinceAnchor * 14);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 13);
  end.setHours(23, 59, 59, 999);

  const nextPayday = new Date(start);
  nextPayday.setDate(start.getDate() + 14);
  nextPayday.setHours(0, 0, 0, 0);

  return { start, end, nextPayday };
}

function formatPayPeriodLabel(start: Date, end: Date) {
  const format = (date: Date) => date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${format(start)} - ${format(end)}`;
}

function isDateLabelInRange(dateLabel: string, start: Date, end: Date) {
  const year = start.getFullYear();
  const parsed = new Date(`${dateLabel}, ${year}`);
  if (Number.isNaN(parsed.getTime())) return false;

  parsed.setHours(12, 0, 0, 0);
  return parsed >= start && parsed <= end;
}

function parseShiftTimeRange(time: string) {
  const parts = time.split("-").map((part) => part.trim());
  if (parts.length !== 2) return null;

  const parseTime = (value: string) => {
    const match = value.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
    if (!match) return null;

    let hours = Number(match[1]);
    const minutes = Number(match[2] || 0);
    const meridiem = match[3].toUpperCase();

    if (meridiem === "PM" && hours !== 12) hours += 12;
    if (meridiem === "AM" && hours === 12) hours = 0;

    return hours + minutes / 60;
  };

  const start = parseTime(parts[0]);
  let end = parseTime(parts[1]);

  if (start === null || end === null) return null;
  if (end <= start) end += 24;

  return { start, end };
}

function shiftsOverlap(firstTime: string, secondTime: string) {
  const first = parseShiftTimeRange(firstTime);
  const second = parseShiftTimeRange(secondTime);
  if (!first || !second) return false;

  return first.start < second.end && second.start < first.end;
}

function calculateShiftHours(time: string) {
  const range = parseShiftTimeRange(time);
  if (!range) return 0;

  return Math.round((range.end - range.start) * 100) / 100;
}

function buildWeekDates(weekOffset: number): CalendarDate[] {
  const monday = getMondayStart();
  monday.setDate(monday.getDate() + weekOffset * 7);

  return WEEK_DAY_NAMES.map((day, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return {
      day,
      dateLabel: formatDateLabel(date),
    };
  });
}

const WEEK_DATE_MAP: Record<WeekKey, CalendarDate[]> = {
  previous: buildWeekDates(-1),
  current: buildWeekDates(0),
  next: buildWeekDates(1),
};

const SHIFT_SEED: ShiftRow[] = [
  {
    id: 101,
    day: WEEK_DATE_MAP.current[0].day,
    dateLabel: WEEK_DATE_MAP.current[0].dateLabel,
    shift: "Open",
    time: "9:00 AM - 5:00 PM",
    employee: "Jay",
    sideworkWindow: "Open",
  },
  {
    id: 102,
    day: WEEK_DATE_MAP.current[1].day,
    dateLabel: WEEK_DATE_MAP.current[1].dateLabel,
    shift: "Close",
    time: "5:00 PM - 1:00 AM",
    employee: "Dawn",
    sideworkWindow: "Close",
  },
  {
    id: 103,
    day: WEEK_DATE_MAP.current[4].day,
    dateLabel: WEEK_DATE_MAP.current[4].dateLabel,
    shift: "Mid",
    time: "12:00 PM - 8:00 PM",
    employee: "Chris",
    sideworkWindow: "Mid",
  },
];

const INITIAL_SIDEWORK: SideworkState = {
  "General Manager": [
    {
      id: 1,
      task: "Verify nightly deposits",
      team: "Leadership",
      assignedTo: "General Manager",
      shiftWindow: "Close",
      active: true,
    },
  ],
  Manager: [
    {
      id: 2,
      task: "Walk floor and support staff",
      team: "Leadership",
      assignedTo: "Manager",
      shiftWindow: "Mid",
      active: true,
    },
  ],
  Lead: [
    {
      id: 7,
      task: "Check shift handoff and support team",
      team: "Leadership",
      assignedTo: "Lead",
      shiftWindow: "Any",
      active: true,
    },
  ],
  Bartender: [
    {
      id: 3,
      task: "Restock juices and syrups",
      team: "Open Team",
      assignedTo: "Bartender",
      shiftWindow: "Open",
      active: true,
    },
    {
      id: 4,
      task: "Polish glassware",
      team: "Close Team",
      assignedTo: "Bartender",
      shiftWindow: "Close",
      active: true,
    },
  ],
  "Bar Back": [
    {
      id: 5,
      task: "Fill ice bins",
      team: "Open Team",
      assignedTo: "Bar Back",
      shiftWindow: "Open",
      active: true,
    },
  ],
  "Back of House": [
    {
      id: 6,
      task: "Check expo and line backup",
      team: "Mid Team",
      assignedTo: "Back of House",
      shiftWindow: "Mid",
      active: true,
    },
  ],
};

const DAY_OPTIONS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const TEAM_OPTIONS = ["Open Team", "Mid Team", "Close Team", "Leadership"];

const SIDEWORK_SHIFT_OPTIONS = ["Open", "Mid", "Close", "Any"];

const AVAILABILITY_OPTIONS = [
  "Not available at all",
  "Not available to open",
  "Not available to close",
  "Available all day",
];

const AVAILABILITY_SEED: AvailabilityRequest[] = [
  {
    id: 201,
    employee: "Jay",
    day: "Sunday",
    restriction: "Not available to open",
    status: "Approved",
  },
  {
    id: 202,
    employee: "Dawn",
    day: "Monday",
    restriction: "Not available at all",
    status: "Pending Manager Approval",
  },
];

const REQUEST_OFF_OPTIONS = ["Open", "Mid", "Close", "All Day"];

const SHIFT_ROLE_MAP: Record<string, Role[]> = {
  Open: ["Bartender", "Lead", "Manager", "General Manager"],
  Mid: ["Bartender", "Bar Back", "Back of House", "Lead", "Manager"],
  Close: ["Bartender", "Bar Back", "Lead", "Manager"],
};

const REQUEST_OFF_SEED: RequestOff[] = [
  {
    id: 301,
    employee: "Jay",
    date: WEEK_DATE_MAP.current[4].dateLabel,
    shift: "All Day",
    note: "Family event",
    status: "Pending Manager Approval",
  },
  {
    id: 302,
    employee: "Chris",
    date: WEEK_DATE_MAP.next[0].dateLabel,
    shift: "Open",
    note: "Doctor appointment",
    status: "Approved",
  },
];

const TRADE_SEED: TradeRequest[] = [
  {
    id: 401,
    employee: "Jay",
    tradeWith: "Dawn",
    shiftId: 101,
    requestedShift: "Close",
    note: "Need later shift if possible",
    status: "Pending Manager Approval",
  },
];

const STORAGE_KEYS = {
  staff: "ops_preview_staff",
  shifts: "ops_preview_shifts",
  publishedSchedule: "ops_preview_published_schedule",
  shiftTemplates: "ops_preview_shift_templates",
  publishMeta: "ops_preview_publish_meta",
  sidework: "ops_preview_sidework",
  sideworkCompletion: "ops_preview_sidework_completion",
  availability: "ops_preview_availability",
  requestOffs: "ops_preview_request_offs",
  tradeRequests: "ops_preview_trade_requests",
  sideworkLog: "ops_preview_sidework_log",
  reviewedMissed: "ops_preview_reviewed_missed",
  cloudConfig: "ops_preview_cloud_config",
};

const CLOUD_TABLES = {
  staff: "ops_staff",
  shifts: "ops_shifts",
  publishedSchedule: "ops_published_schedule",
  publishMeta: "ops_publish_meta",
  sidework: "ops_sidework",
  sideworkCompletion: "ops_sidework_completion",
  availability: "ops_availability",
  requestOffs: "ops_request_offs",
  tradeRequests: "ops_trade_requests",
  sideworkLog: "ops_sidework_log",
  reviewedMissed: "ops_reviewed_missed",
} as const;

type StorageMode = "local" | "cloud";

type CloudConfig = {
  mode: StorageMode;
  projectUrl: string;
  anonKey: string;
  workspaceId: string;
};

const DEFAULT_CLOUD_CONFIG: CloudConfig = {
  mode: "cloud",
  projectUrl: "https://ogwfgzbmcffoxvzjpgkd.supabase.co",
  anonKey: "sb_publishable_c4LWR-okXE-0kRscGTyOJQ_RS_KdQOs",
  workspaceId: "mosesmcqueens-default",
};

function loadStoredState<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveStoredState<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizeSupabaseUrl(url: string) {
  return url.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
}

async function saveCloudRecord<T>(config: CloudConfig, table: string, workspaceId: string, payload: T) {
  const projectUrl = normalizeSupabaseUrl(config.projectUrl);
  const anonKey = config.anonKey.trim();

  if (!projectUrl || !anonKey) {
    throw new Error("Missing Supabase project URL or publishable key.");
  }

  const response = await fetch(`${projectUrl}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify({
      workspace_id: workspaceId,
      payload,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Failed to save ${table}`);
  }
}

async function loadCloudRecord<T>(config: CloudConfig, table: string, workspaceId: string, fallback: T): Promise<T> {
  const projectUrl = normalizeSupabaseUrl(config.projectUrl);
  const anonKey = config.anonKey.trim();

  if (!projectUrl || !anonKey) {
    throw new Error("Missing Supabase project URL or publishable key.");
  }

  const response = await fetch(`${projectUrl}/rest/v1/${table}?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=payload&order=updated_at.desc&limit=1`, {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Failed to load ${table}`);
  }

  const rows = (await response.json()) as Array<{ payload: T }>;
  return rows[0]?.payload ?? fallback;
}

async function syncAllCloudData(params: {
  cloudConfig: CloudConfig;
  workspaceId: string;
  staffState: StaffMember[];
  scheduleState: ShiftRow[];
  publishedSchedule: ShiftRow[];
  publishMeta: PublishMeta;
  sideworkState: SideworkState;
  sideworkCompletionState: Record<number, SideworkCompletion>;
  availabilityRequests: AvailabilityRequest[];
  requestOffs: RequestOff[];
  tradeRequests: TradeRequest[];
  sideworkLog: SideworkLog[];
  reviewedMissed: Record<number, boolean>;
}) {
  const {
    cloudConfig,
    workspaceId,
    staffState,
    scheduleState,
    publishedSchedule,
    publishMeta,
    sideworkState,
    sideworkCompletionState,
    availabilityRequests,
    requestOffs,
    tradeRequests,
    sideworkLog,
    reviewedMissed,
  } = params;

  await Promise.all([
    saveCloudRecord(cloudConfig, CLOUD_TABLES.staff, workspaceId, staffState),
    saveCloudRecord(cloudConfig, CLOUD_TABLES.shifts, workspaceId, scheduleState),
    saveCloudRecord(cloudConfig, CLOUD_TABLES.publishedSchedule, workspaceId, publishedSchedule),
    saveCloudRecord(cloudConfig, CLOUD_TABLES.publishMeta, workspaceId, publishMeta),
    saveCloudRecord(cloudConfig, CLOUD_TABLES.sidework, workspaceId, sideworkState),
    saveCloudRecord(cloudConfig, CLOUD_TABLES.sideworkCompletion, workspaceId, sideworkCompletionState),
    saveCloudRecord(cloudConfig, CLOUD_TABLES.availability, workspaceId, availabilityRequests),
    saveCloudRecord(cloudConfig, CLOUD_TABLES.requestOffs, workspaceId, requestOffs),
    saveCloudRecord(cloudConfig, CLOUD_TABLES.tradeRequests, workspaceId, tradeRequests),
    saveCloudRecord(cloudConfig, CLOUD_TABLES.sideworkLog, workspaceId, sideworkLog),
    saveCloudRecord(cloudConfig, CLOUD_TABLES.reviewedMissed, workspaceId, reviewedMissed),
  ]);
}

async function loadAllCloudData(params: {
  cloudConfig: CloudConfig;
  workspaceId: string;
  fallback: {
    staffState: StaffMember[];
    scheduleState: ShiftRow[];
    publishedSchedule: ShiftRow[];
    publishMeta: PublishMeta;
    sideworkState: SideworkState;
    sideworkCompletionState: Record<number, SideworkCompletion>;
    availabilityRequests: AvailabilityRequest[];
    requestOffs: RequestOff[];
    tradeRequests: TradeRequest[];
    sideworkLog: SideworkLog[];
    reviewedMissed: Record<number, boolean>;
  };
}) {
  const { cloudConfig, workspaceId, fallback } = params;

  const [staffState, scheduleState, publishedSchedule, publishMeta, sideworkState, sideworkCompletionState, availabilityRequests, requestOffs, tradeRequests, sideworkLog, reviewedMissed] = await Promise.all([
    loadCloudRecord(cloudConfig, CLOUD_TABLES.staff, workspaceId, fallback.staffState),
    loadCloudRecord(cloudConfig, CLOUD_TABLES.shifts, workspaceId, fallback.scheduleState),
    loadCloudRecord(cloudConfig, CLOUD_TABLES.publishedSchedule, workspaceId, fallback.publishedSchedule),
    loadCloudRecord(cloudConfig, CLOUD_TABLES.publishMeta, workspaceId, fallback.publishMeta),
    loadCloudRecord(cloudConfig, CLOUD_TABLES.sidework, workspaceId, fallback.sideworkState),
    loadCloudRecord(cloudConfig, CLOUD_TABLES.sideworkCompletion, workspaceId, fallback.sideworkCompletionState),
    loadCloudRecord(cloudConfig, CLOUD_TABLES.availability, workspaceId, fallback.availabilityRequests),
    loadCloudRecord(cloudConfig, CLOUD_TABLES.requestOffs, workspaceId, fallback.requestOffs),
    loadCloudRecord(cloudConfig, CLOUD_TABLES.tradeRequests, workspaceId, fallback.tradeRequests),
    loadCloudRecord(cloudConfig, CLOUD_TABLES.sideworkLog, workspaceId, fallback.sideworkLog),
    loadCloudRecord(cloudConfig, CLOUD_TABLES.reviewedMissed, workspaceId, fallback.reviewedMissed),
  ]);

  return {
    staffState,
    scheduleState,
    publishedSchedule,
    publishMeta,
    sideworkState,
    sideworkCompletionState,
    availabilityRequests,
    requestOffs,
    tradeRequests,
    sideworkLog,
    reviewedMissed,
  };
}

function digitsOnly(value: string) {
  return value.split("").filter((ch) => ch >= "0" && ch <= "9").join("");
}

function getStaffPermissions(member: StaffMember | null): StaffPermissions {
  if (!member) return { ...DEFAULT_PERMISSIONS };
  return {
    ...getDefaultPermissionsForRole(member.role),
    ...(member.permissions || {}),
  };
}

function getAvailabilityIssue(
  employee: string,
  day: string,
  shift: string,
  availabilityRequests: AvailabilityRequest[]
): string | null {
  const approvedRules = availabilityRequests.filter(
    (item) => item.employee === employee && item.day === day && item.status === "Approved"
  );

  for (const rule of approvedRules) {
    if (rule.restriction === "Not available at all") {
      return `${employee} is not available at all on ${day}.`;
    }
    if (rule.restriction === "Not available to open" && shift === "Open") {
      return `${employee} is not available to open on ${day}.`;
    }
    if (rule.restriction === "Not available to close" && ["Mid", "Close"].includes(shift)) {
      return `${employee} is not available to close on ${day}.`;
    }
  }

  return null;
}

function getRequestOffIssue(
  employee: string,
  dateLabel: string,
  shift: string,
  requestOffs: RequestOff[]
): string | null {
  const approvedRequests = requestOffs.filter(
    (item) => item.employee === employee && item.date === dateLabel && item.status === "Approved"
  );

  for (const request of approvedRequests) {
    if (request.shift === "All Day") {
      return `${employee} is approved off for all day on ${dateLabel}.`;
    }
    if (request.shift === shift) {
      return `${employee} is approved off for the ${shift} shift on ${dateLabel}.`;
    }
  }

  return null;
}

function AppCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[2rem] border border-stone-200/80 bg-white/95 p-5 shadow-[0_18px_50px_rgba(28,25,23,0.09)] backdrop-blur transition hover:shadow-[0_24px_70px_rgba(28,25,23,0.12)]">
      {title ? (
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-stone-100 pb-3">
          <h2 className="text-lg font-black tracking-tight text-stone-950">{title}</h2>
          <div className="h-2 w-2 rounded-full bg-amber-400" />
        </div>
      ) : null}
      {children}
    </div>
  );
}

function SmallCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-stone-200/80 bg-gradient-to-br from-white via-white to-stone-50 p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${className}`}>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
      {text}
    </div>
  );
}

function getRoleBadgeClass(role: Role) {
  switch (role) {
    case "Bartender":
      return "bg-sky-100 text-sky-800 ring-sky-200";
    case "Bar Back":
      return "bg-emerald-100 text-emerald-800 ring-emerald-200";
    case "Manager":
      return "bg-purple-100 text-purple-800 ring-purple-200";
    case "General Manager":
      return "bg-amber-100 text-amber-900 ring-amber-200";
    case "Lead":
      return "bg-rose-100 text-rose-800 ring-rose-200";
    case "Back of House":
      return "bg-orange-100 text-orange-800 ring-orange-200";
    default:
      return "bg-stone-100 text-stone-700 ring-stone-200";
  }
}

function getEmployeeRole(employee: string, staffState: StaffMember[]): Role | null {
  return staffState.find((member) => member.name === employee)?.role || null;
}

function TabButton({ label, active, onClick }: { label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-bold tracking-tight transition-all duration-200 active:scale-95 ${
        active
          ? "bg-stone-950 text-white shadow-lg shadow-stone-900/20 ring-1 ring-stone-900"
          : "bg-white/90 text-stone-700 shadow-sm ring-1 ring-stone-200 hover:-translate-y-0.5 hover:bg-stone-50 hover:text-stone-950 hover:shadow-md"
      }`}
    >
      {label}
    </button>
  );
}

export default function MosesMcQueensOpsPreview() {
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [calendarWeek, setCalendarWeek] = useState<WeekKey>("current");
  const [currentUser, setCurrentUser] = useState<StaffMember | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const [staffState, setStaffState] = useState<StaffMember[]>(() =>
    loadStoredState(STORAGE_KEYS.staff, STAFF_SEED)
  );
  const [scheduleState, setScheduleState] = useState<ShiftRow[]>(() =>
    loadStoredState(STORAGE_KEYS.shifts, SHIFT_SEED)
  );
  const [publishedSchedule, setPublishedSchedule] = useState<ShiftRow[]>(() =>
    loadStoredState(STORAGE_KEYS.publishedSchedule, SHIFT_SEED)
  );
  const [publishMeta, setPublishMeta] = useState<PublishMeta>(() =>
    loadStoredState(STORAGE_KEYS.publishMeta, { lastPublishedAt: null })
  );
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>(() =>
    loadStoredState(STORAGE_KEYS.shiftTemplates, DEFAULT_SHIFT_TEMPLATES)
  );
  const [sideworkState, setSideworkState] = useState<SideworkState>(() =>
    loadStoredState(STORAGE_KEYS.sidework, INITIAL_SIDEWORK)
  );
  const [sideworkCompletionState, setSideworkCompletionState] = useState<Record<number, SideworkCompletion>>(() =>
    loadStoredState(STORAGE_KEYS.sideworkCompletion, {})
  );
  const [availabilityRequests, setAvailabilityRequests] = useState<AvailabilityRequest[]>(() =>
    loadStoredState(STORAGE_KEYS.availability, AVAILABILITY_SEED)
  );
  const [requestOffs, setRequestOffs] = useState<RequestOff[]>(() =>
    loadStoredState(STORAGE_KEYS.requestOffs, REQUEST_OFF_SEED)
  );
  const [tradeRequests, setTradeRequests] = useState<TradeRequest[]>(() =>
    loadStoredState(STORAGE_KEYS.tradeRequests, TRADE_SEED)
  );
  const [sideworkLog, setSideworkLog] = useState<SideworkLog[]>(() =>
    loadStoredState(STORAGE_KEYS.sideworkLog, [])
  );
  const [reviewedMissed, setReviewedMissed] = useState<Record<number, boolean>>(() =>
    loadStoredState(STORAGE_KEYS.reviewedMissed, {})
  );
  const [cloudConfig, setCloudConfig] = useState<CloudConfig>(() =>
    loadStoredState(STORAGE_KEYS.cloudConfig, DEFAULT_CLOUD_CONFIG)
  );
  const [cloudStatus, setCloudStatus] = useState<string>(
    cloudConfig.mode === "cloud" ? "Cloud mode ready" : "Local save active"
  );
  const [cloudBusy, setCloudBusy] = useState(false);
  const [showCloudPinPrompt, setShowCloudPinPrompt] = useState(false);
  const [cloudAdminPin, setCloudAdminPin] = useState("");
  const [cloudPinError, setCloudPinError] = useState(false);
  const [hasLoadedCloud, setHasLoadedCloud] = useState(false);
  const [lastLiveSyncAt, setLastLiveSyncAt] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState("Realtime standby");
  const realtimeChannelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoPushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoPullTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isApplyingCloudPullRef = useRef(false);
  const lastLocalEditAtRef = useRef(0);
  const LOCAL_EDIT_GRACE_MS = 8000;

  const [overrideWarning, setOverrideWarning] = useState<string | null>(null);
const [pendingScheduleSave, setPendingScheduleSave] = useState<null | (() => void)>(null);

const [scheduleForm, setScheduleForm] = useState({
    id: null as number | null,
    dateLabel: WEEK_DATE_MAP.current[0].dateLabel,
    shift: DEFAULT_SHIFT_TEMPLATES[0].name,
    employee: STAFF_SEED[0].name,
    sideworkWindow: DEFAULT_SHIFT_TEMPLATES[0].sideworkWindow,
  });
  const [shiftTemplateForm, setShiftTemplateForm] = useState({
    id: null as number | null,
    name: "",
    startTime: "10:00 AM",
    endTime: "4:00 PM",
    sideworkWindow: "Open" as "Open" | "Mid" | "Close",
  });
  const [sideworkForm, setSideworkForm] = useState({
    id: null as number | null,
    role: "Bartender" as Role,
    task: "",
    team: "Open Team",
    shiftWindow: "Open",
    active: true,
  });
  const [staffForm, setStaffForm] = useState({
    name: "",
    role: "Bartender" as Role,
    pin: "",
  });
  const [availabilityForm, setAvailabilityForm] = useState({
    employee: STAFF_SEED[0].name,
    day: "Monday",
    restriction: "Not available at all",
  });
  const [requestOffForm, setRequestOffForm] = useState({
    employee: STAFF_SEED[0].name,
    date: WEEK_DATE_MAP.current[0].dateLabel,
    shift: "Open",
    note: "",
  });
  const [tradeForm, setTradeForm] = useState({
    employee: STAFF_SEED[0].name,
    shiftId: "",
    tradeWith: "",
    requestedShift: "Open",
    note: "",
  });
  const [showSideworkHistory, setShowSideworkHistory] = useState(false);
  const [sideworkFilter, setSideworkFilter] = useState("All");
  const [activeShift, setActiveShift] = useState<string | null>(null);
  const [showShiftSelector, setShowShiftSelector] = useState(false);
  const [showScheduleBuilder, setShowScheduleBuilder] = useState(true);
  const [showShiftTemplates, setShowShiftTemplates] = useState(false);
  const [staffScheduleMode, setStaffScheduleMode] = useState<"mine" | "team">("mine");
  const [missedTaskDraft, setMissedTaskDraft] = useState<MissedTaskDraft>({ itemId: null, note: "" });

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    saveStoredState(STORAGE_KEYS.staff, staffState);
  }, [staffState]);
  useEffect(() => {
    saveStoredState(STORAGE_KEYS.shifts, scheduleState);
  }, [scheduleState]);
  useEffect(() => {
    saveStoredState(STORAGE_KEYS.publishedSchedule, publishedSchedule);
  }, [publishedSchedule]);
  useEffect(() => {
    saveStoredState(STORAGE_KEYS.publishMeta, publishMeta);
  }, [publishMeta]);
  useEffect(() => {
    saveStoredState(STORAGE_KEYS.shiftTemplates, shiftTemplates);
  }, [shiftTemplates]);
  useEffect(() => {
    saveStoredState(STORAGE_KEYS.sidework, sideworkState);
  }, [sideworkState]);
  useEffect(() => {
    saveStoredState(STORAGE_KEYS.sideworkCompletion, sideworkCompletionState);
  }, [sideworkCompletionState]);
  useEffect(() => {
    saveStoredState(STORAGE_KEYS.availability, availabilityRequests);
  }, [availabilityRequests]);
  useEffect(() => {
    saveStoredState(STORAGE_KEYS.requestOffs, requestOffs);
  }, [requestOffs]);
  useEffect(() => {
    saveStoredState(STORAGE_KEYS.tradeRequests, tradeRequests);
  }, [tradeRequests]);
  useEffect(() => {
    saveStoredState(STORAGE_KEYS.sideworkLog, sideworkLog);
  }, [sideworkLog]);
  useEffect(() => {
    saveStoredState(STORAGE_KEYS.reviewedMissed, reviewedMissed);
  }, [reviewedMissed]);
  useEffect(() => {
    saveStoredState(STORAGE_KEYS.cloudConfig, cloudConfig);
  }, [cloudConfig]);


  useEffect(() => {
    async function loadCloudData() {
      if (cloudConfig.mode !== "cloud") {
        setHasLoadedCloud(false);
        setCloudStatus("Local save active");
        return;
      }

      if (!cloudConfig.projectUrl.trim() || !cloudConfig.anonKey.trim()) {
        setCloudStatus("Cloud mode selected — enter Supabase URL and publishable key");
        return;
      }

      setCloudBusy(true);
      setCloudStatus("Loading cloud data...");

      try {
        const workspaceId = cloudConfig.workspaceId.trim() || DEFAULT_CLOUD_CONFIG.workspaceId;
        const cloudData = await loadAllCloudData({
          cloudConfig,
          workspaceId,
          fallback: {
            staffState,
            scheduleState,
            publishedSchedule,
            publishMeta,
            sideworkState,
            sideworkCompletionState,
            availabilityRequests,
            requestOffs,
            tradeRequests,
            sideworkLog,
            reviewedMissed,
          },
        });

        const cloudStaff = cloudData.staffState;
        const cloudShifts = cloudData.scheduleState;
        const cloudPublished = cloudData.publishedSchedule;
        const cloudMeta = cloudData.publishMeta;
        const cloudSidework = cloudData.sideworkState;
        const cloudCompletion = cloudData.sideworkCompletionState;
        const cloudAvailability = cloudData.availabilityRequests;
        const cloudRequestOffs = cloudData.requestOffs;
        const cloudTrades = cloudData.tradeRequests;
        const cloudLog = cloudData.sideworkLog;
        const cloudReviewed = cloudData.reviewedMissed;

        setStaffState(cloudStaff);
        setScheduleState(cloudShifts);
        setPublishedSchedule(cloudPublished);
        setPublishMeta(cloudMeta);
        setSideworkState(cloudSidework);
        setSideworkCompletionState(cloudCompletion);
        setAvailabilityRequests(cloudAvailability);
        setRequestOffs(cloudRequestOffs);
        setTradeRequests(cloudTrades);
        setSideworkLog(cloudLog);
        setReviewedMissed(cloudReviewed);
        setHasLoadedCloud(true);
        setCloudStatus("Cloud data loaded");
      } catch {
        setCloudStatus("Cloud load failed — using current local data");
      } finally {
        setCloudBusy(false);
      }
    }

    void loadCloudData();
  }, [cloudConfig.mode, cloudConfig.projectUrl, cloudConfig.anonKey, cloudConfig.workspaceId]);

  // Cloud saves are handled by the debounced auto-push effect below.
  // This prevents cloud pulls from racing against fresh local edits.

  useEffect(() => {
    if (cloudConfig.mode !== "cloud") return;
    if (!cloudConfig.projectUrl.trim() || !cloudConfig.anonKey.trim()) return;
    if (!hasLoadedCloud) return;
    if (isApplyingCloudPullRef.current) return;

    lastLocalEditAtRef.current = Date.now();

    if (autoPushTimerRef.current) {
      clearTimeout(autoPushTimerRef.current);
    }

    autoPushTimerRef.current = setTimeout(() => {
      void pushCloudDataNow();
    }, 1200);

    return () => {
      if (autoPushTimerRef.current) {
        clearTimeout(autoPushTimerRef.current);
      }
    };
  }, [
    cloudConfig.mode,
    cloudConfig.projectUrl,
    cloudConfig.anonKey,
    cloudConfig.workspaceId,
    hasLoadedCloud,
    staffState,
    scheduleState,
    publishedSchedule,
    publishMeta,
    sideworkState,
    sideworkCompletionState,
    availabilityRequests,
    requestOffs,
    tradeRequests,
    sideworkLog,
    reviewedMissed,
  ]);

  useEffect(() => {
    if (autoPullTimerRef.current) {
      clearInterval(autoPullTimerRef.current);
      autoPullTimerRef.current = null;
    }

    // No constant polling. Realtime pulls changes when Supabase reports updates.
    // Manual Refresh Cloud Data remains available as a backup.
    setCloudStatus((prev) => (cloudConfig.mode === "cloud" ? prev : "Local save active"));

    return () => {
      if (autoPullTimerRef.current) {
        clearInterval(autoPullTimerRef.current);
        autoPullTimerRef.current = null;
      }
    };
  }, [cloudConfig.mode, cloudConfig.projectUrl, cloudConfig.anonKey, cloudConfig.workspaceId]);

  useEffect(() => {
    if (realtimeChannelRef.current) {
      realtimeChannelRef.current.unsubscribe();
      realtimeChannelRef.current = null;
    }

    if (cloudConfig.mode !== "cloud") {
      setRealtimeStatus("Realtime off in local mode");
      return;
    }

    const projectUrl = normalizeSupabaseUrl(cloudConfig.projectUrl);
    const anonKey = cloudConfig.anonKey.trim();
    const workspaceId = (cloudConfig.workspaceId || DEFAULT_CLOUD_CONFIG.workspaceId).trim();

    if (!projectUrl || !anonKey || !workspaceId) {
      setRealtimeStatus("Realtime waiting for cloud settings");
      return;
    }

    const client = createClient(projectUrl, anonKey);
    const channel = client.channel(`ops-live-${workspaceId}`);

    Object.values(CLOUD_TABLES).forEach((table) => {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          setRealtimeStatus("Realtime update received");
          if (realtimeRefreshTimerRef.current) {
            clearTimeout(realtimeRefreshTimerRef.current);
          }
          realtimeRefreshTimerRef.current = setTimeout(() => {
            void refreshCloudDataNow(true);
          }, 250);
        }
      );
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setRealtimeStatus("Realtime connected");
      } else if (status === "CHANNEL_ERROR") {
        setRealtimeStatus("Realtime needs Supabase table enablement");
      } else if (status === "TIMED_OUT") {
        setRealtimeStatus("Realtime timed out — live sync backup active");
      } else if (status === "CLOSED") {
        setRealtimeStatus("Realtime closed — live sync backup active");
      } else {
        setRealtimeStatus(`Realtime ${status.toLowerCase()}`);
      }
    });

    realtimeChannelRef.current = channel;

    return () => {
      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = null;
      }
      channel.unsubscribe();
      if (realtimeChannelRef.current === channel) {
        realtimeChannelRef.current = null;
      }
    };
  }, [cloudConfig.mode, cloudConfig.projectUrl, cloudConfig.anonKey, cloudConfig.workspaceId]);

  useEffect(() => {
    function handleFocusLiveSync() {
      if (cloudConfig.mode !== "cloud") return;
      if (!cloudConfig.projectUrl.trim() || !cloudConfig.anonKey.trim()) return;
      void refreshCloudDataNow(true);
    }

    window.addEventListener("focus", handleFocusLiveSync);
    document.addEventListener("visibilitychange", handleFocusLiveSync);

    return () => {
      window.removeEventListener("focus", handleFocusLiveSync);
      document.removeEventListener("visibilitychange", handleFocusLiveSync);
    };
  }, [cloudConfig.mode, cloudConfig.projectUrl, cloudConfig.anonKey, cloudConfig.workspaceId]);

  const allScheduleDates = useMemo(
    () => [...WEEK_DATE_MAP.previous, ...WEEK_DATE_MAP.current, ...WEEK_DATE_MAP.next],
    []
  );
  const visibleScheduleDays = useMemo(() => WEEK_DATE_MAP[calendarWeek], [calendarWeek]);

  const availableShiftTemplates = useMemo(() => {
    const templateMap = new Map<string, ShiftTemplate>();

    shiftTemplates.forEach((template) => {
      templateMap.set(template.name, { ...template, active: template.active !== false });
    });

    [...scheduleState, ...publishedSchedule].forEach((row) => {
      if (templateMap.has(row.shift)) return;

      const inferredSideworkWindow =
        row.sideworkWindow === "Open" || row.sideworkWindow === "Mid" || row.sideworkWindow === "Close"
          ? row.sideworkWindow
          : row.shift.toLowerCase().includes("close")
          ? "Close"
          : row.shift.toLowerCase().includes("mid")
          ? "Mid"
          : "Open";

      templateMap.set(row.shift, {
        id: Date.now() + templateMap.size,
        name: row.shift,
        time: row.time,
        sideworkWindow: inferredSideworkWindow,
        active: true,
      });
    });

    return Array.from(templateMap.values());
  }, [shiftTemplates, scheduleState, publishedSchedule]);

  const activeShiftTemplates = useMemo(
    () => availableShiftTemplates.filter((template) => template.active !== false),
    [availableShiftTemplates]
  );

  const userRole = currentUser?.role;
  const userPermissions = useMemo(() => getStaffPermissions(currentUser), [currentUser]);
  const isLeadership = userRole === "General Manager" || userRole === "Manager" || Boolean(userPermissions.schedule || userPermissions.sidework || userPermissions.approvals || userPermissions.staff);
  const canManageSchedule = Boolean(currentUser && userPermissions.schedule);
  const canManageSidework = Boolean(currentUser && userPermissions.sidework);
  const canManageApprovals = Boolean(currentUser && userPermissions.approvals);
  const canManageStaff = Boolean(currentUser && userPermissions.staff);
  const canAccessCloudSync = Boolean(currentUser && userPermissions.cloudSync);

  const visibleScheduleSource = currentUser && !isLeadership ? publishedSchedule : scheduleState;

  const todayDateLabel = useMemo(() => formatDateLabel(now), [now]);
  const todayDayName = useMemo(() => now.toLocaleDateString("en-US", { weekday: "long" }), [now]);

  const todayDetectedShift = useMemo(() => {
    if (!currentUser || isLeadership) return null;
    const todayShift = publishedSchedule.find(
      (shift) =>
        shift.employee === currentUser.name &&
        shift.dateLabel === todayDateLabel &&
        shift.day === todayDayName
    );
    return todayShift?.sideworkWindow || todayShift?.shift || null;
  }, [currentUser, isLeadership, publishedSchedule, todayDateLabel, todayDayName]);

  useEffect(() => {
    if (!currentUser || isLeadership) return;
    if (activeShift) return;
    if (todayDetectedShift) {
      setActiveShift(todayDetectedShift);
      setSideworkFilter(todayDetectedShift);
    }
  }, [currentUser, isLeadership, activeShift, todayDetectedShift]);

  const totalScheduleCount = scheduleState.length;
  const activeStaffCount = staffState.filter((s) => s.active).length;
  const sideworkCount = Object.values(sideworkState).reduce((total, items) => total + items.length, 0);
  const approvedAvailabilityCount = availabilityRequests.filter((item) => item.status === "Approved").length;
  const approvedRequestOffCount = requestOffs.filter((item) => item.status === "Approved").length;
  const pendingApprovalCount =
    availabilityRequests.filter((item) => item.status === "Pending Manager Approval").length +
    requestOffs.filter((item) => item.status === "Pending Manager Approval").length +
    tradeRequests.filter((item) => item.status === "Pending Manager Approval").length;

  const shiftsThisWeek = useMemo(
    () =>
      visibleScheduleSource.filter((row) =>
        visibleScheduleDays.some((day) => day.day === row.day && day.dateLabel === row.dateLabel)
      ),
    [visibleScheduleSource, visibleScheduleDays]
  );

  const sortedSchedule = useMemo(() => {
    const order = allScheduleDates.map((d) => `${d.day}-${d.dateLabel}`);
    return [...visibleScheduleSource].sort((a, b) => {
      const aIndex = order.indexOf(`${a.day}-${a.dateLabel}`);
      const bIndex = order.indexOf(`${b.day}-${b.dateLabel}`);
      if (aIndex !== bIndex) return aIndex - bIndex;
      return a.shift.localeCompare(b.shift);
    });
  }, [visibleScheduleSource, allScheduleDates]);

  const myPublishedShifts = useMemo(() => {
    if (!currentUser || isLeadership) return [];

    const order = allScheduleDates.map((d) => `${d.day}-${d.dateLabel}`);
    const todayIndex = order.indexOf(`${todayDayName}-${todayDateLabel}`);
    const safeTodayIndex = todayIndex >= 0 ? todayIndex : 0;

    return [...publishedSchedule]
      .filter((shift) => {
        if (shift.employee !== currentUser.name) return false;
        const shiftIndex = order.indexOf(`${shift.day}-${shift.dateLabel}`);
        return shiftIndex >= safeTodayIndex;
      })
      .sort((a, b) => {
        const aIndex = order.indexOf(`${a.day}-${a.dateLabel}`);
        const bIndex = order.indexOf(`${b.day}-${b.dateLabel}`);
        if (aIndex !== bIndex) return aIndex - bIndex;
        return a.shift.localeCompare(b.shift);
      });
  }, [currentUser, isLeadership, publishedSchedule, allScheduleDates, todayDayName, todayDateLabel]);

  const myNextShift = myPublishedShifts[0] || null;
  const myFollowingShift = myPublishedShifts[1] || null;

  const myWeeklyHours = useMemo(() => {
    if (!currentUser || isLeadership) return 0;
    return publishedSchedule
      .filter(
        (shift) =>
          shift.employee === currentUser.name &&
          visibleScheduleDays.some((day) => day.day === shift.day && day.dateLabel === shift.dateLabel)
      )
      .reduce((total, shift) => total + calculateShiftHours(shift.time), 0);
  }, [currentUser, isLeadership, publishedSchedule, visibleScheduleDays]);

  const currentPayPeriod = useMemo(() => getCurrentPayPeriod(now), [now]);

  const myPayPeriodHours = useMemo(() => {
    if (!currentUser || isLeadership) return 0;
    return publishedSchedule
      .filter(
        (shift) =>
          shift.employee === currentUser.name &&
          isDateLabelInRange(shift.dateLabel, currentPayPeriod.start, currentPayPeriod.end)
      )
      .reduce((total, shift) => total + calculateShiftHours(shift.time), 0);
  }, [currentUser, isLeadership, publishedSchedule, currentPayPeriod]);

  const myPayPeriodLabel = useMemo(
    () => formatPayPeriodLabel(currentPayPeriod.start, currentPayPeriod.end),
    [currentPayPeriod]
  );

  const myPublishedThisWeek = useMemo(
    () => {
      if (!currentUser || isLeadership) return [];
      const dayOrder = visibleScheduleDays.map((day) => `${day.day}-${day.dateLabel}`);
      return publishedSchedule
        .filter(
          (shift) =>
            shift.employee === currentUser.name &&
            visibleScheduleDays.some((day) => day.day === shift.day && day.dateLabel === shift.dateLabel)
        )
        .sort((a, b) => {
          const aIndex = dayOrder.indexOf(`${a.day}-${a.dateLabel}`);
          const bIndex = dayOrder.indexOf(`${b.day}-${b.dateLabel}`);
          if (aIndex !== bIndex) return aIndex - bIndex;
          return a.time.localeCompare(b.time);
        });
    },
    [currentUser, isLeadership, publishedSchedule, visibleScheduleDays]
  );

  const publishedThisWeek = useMemo(
    () => {
      const dayOrder = visibleScheduleDays.map((day) => `${day.day}-${day.dateLabel}`);
      return publishedSchedule
        .filter((row) =>
          visibleScheduleDays.some((day) => day.day === row.day && day.dateLabel === row.dateLabel)
        )
        .sort((a, b) => {
          const aIndex = dayOrder.indexOf(`${a.day}-${a.dateLabel}`);
          const bIndex = dayOrder.indexOf(`${b.day}-${b.dateLabel}`);
          if (aIndex !== bIndex) return aIndex - bIndex;
          return a.time.localeCompare(b.time);
        });
    },
    [publishedSchedule, visibleScheduleDays]
  );

  const staffVisibleScheduleSource = useMemo(() => {
    if (!currentUser || isLeadership) return visibleScheduleSource;
    if (staffScheduleMode === "team") return visibleScheduleSource;
    return visibleScheduleSource.filter((shift) => shift.employee === currentUser.name);
  }, [currentUser, isLeadership, staffScheduleMode, visibleScheduleSource]);

  const scheduleAlerts = useMemo<Record<number, ScheduleAlert>>(() => {
    const alerts: Record<number, ScheduleAlert> = {};
    scheduleState.forEach((row) => {
      alerts[row.id] = {
        availabilityIssue: getAvailabilityIssue(row.employee, row.day, row.shift, availabilityRequests),
        requestOffIssue: getRequestOffIssue(row.employee, row.dateLabel, row.shift, requestOffs),
        doubleBooked: scheduleState.some(
          (other) => other.id !== row.id && other.employee === row.employee && other.dateLabel === row.dateLabel
        ),
      };
    });
    return alerts;
  }, [scheduleState, availabilityRequests, requestOffs]);

  const scheduleConflictCount = useMemo(
    () => Object.values(scheduleAlerts).filter((item) => item.availabilityIssue || item.requestOffIssue || item.doubleBooked).length,
    [scheduleAlerts]
  );

  const mySideworkItems = useMemo(() => {
    if (!currentUser) return [];
    const base = sideworkState[currentUser.role] || [];
    if (sideworkFilter === "All") return base;
    return base.filter((item) => item.shiftWindow === sideworkFilter || item.shiftWindow === "Any");
  }, [currentUser, sideworkState, sideworkFilter]);

  const allSideworkItems = useMemo(
    () => ROLES.flatMap((role) => (sideworkState[role] || []).map((item) => ({ ...item, role }))),
    [sideworkState]
  );

  const pendingSideworkItems = useMemo(
    () =>
      allSideworkItems.filter((item) => {
        const state = sideworkCompletionState[item.id];
        return !state || state.status === "pending" || typeof state.status === "undefined";
      }),
    [allSideworkItems, sideworkCompletionState]
  );

  const completedSideworkItems = useMemo(
    () => allSideworkItems.filter((item) => sideworkCompletionState[item.id]?.status === "completed"),
    [allSideworkItems, sideworkCompletionState]
  );

  const missedNeedingReview = useMemo(
    () => sideworkLog.filter((entry) => !entry.completed && !reviewedMissed[entry.id]),
    [sideworkLog, reviewedMissed]
  );

  const visibleIncompleteMySideworkCount = useMemo(
    () => mySideworkItems.filter((item) => sideworkCompletionState[item.id]?.status !== "completed").length,
    [mySideworkItems, sideworkCompletionState]
  );

  const mySideworkProgress = useMemo(() => {
    const total = mySideworkItems.length;
    const completed = mySideworkItems.filter((item) => sideworkCompletionState[item.id]?.status === "completed").length;
    const percent = total ? Math.round((completed / total) * 100) : 0;
    return { total, completed, percent };
  }, [mySideworkItems, sideworkCompletionState]);

  const myShiftProgress = useMemo(() => {
    const shifts = ["Open", "Mid", "Close"] as const;
    const roleItems = currentUser ? sideworkState[currentUser.role] || [] : [];
    return shifts.map((shift) => {
      const items = roleItems.filter((item) => item.shiftWindow === shift || item.shiftWindow === "Any");
      const total = items.length;
      const completed = items.filter((item) => sideworkCompletionState[item.id]?.status === "completed").length;
      const percent = total ? Math.round((completed / total) * 100) : 0;
      return { shift, total, completed, percent };
    });
  }, [currentUser, sideworkState, sideworkCompletionState]);

  function handleLogin() {
    const matchedUser = staffState.find((member) => member.active && member.pin === pin.trim());
    if (!matchedUser) {
      setLoginError(true);
      setPin("");
      return;
    }
    setCurrentUser(matchedUser);
    setLoginError(false);
    setPin("");
    setShowLogin(false);
  }

  function closeLogin() {
    setShowLogin(false);
    setPin("");
    setLoginError(false);
  }

  function handleLogout() {
    setCurrentUser(null);
    setPin("");
    setLoginError(false);
    setShowLogin(false);
    setActiveView("dashboard");
  }

  function publishSchedule() {
    if (!canManageSchedule) return;
    setPublishedSchedule(scheduleState);
    setPublishMeta({ lastPublishedAt: new Date().toLocaleString() });
  }

  function resetScheduleForm(dateLabel = WEEK_DATE_MAP[calendarWeek][0].dateLabel) {
    setScheduleForm({
      id: null,
      dateLabel,
      shift: activeShiftTemplates[0]?.name || "Open",
      employee: staffState.find((member) => member.active)?.name || "Jay",
      sideworkWindow: activeShiftTemplates[0]?.sideworkWindow || "Open",
    });
  }

  function resetSideworkForm() {
    setSideworkForm({
      id: null,
      role: "Bartender",
      task: "",
      team: "Open Team",
      shiftWindow: "Open",
      active: true,
    });
  }

  function saveScheduleRow() {
    const selectedDate = allScheduleDates.find((d) => d.dateLabel === scheduleForm.dateLabel);
    if (!selectedDate) return;

    const selectedTemplate = availableShiftTemplates.find((t) => t.name === scheduleForm.shift);
    const nextRow: ShiftRow = {
      id: scheduleForm.id ?? Date.now(),
      day: selectedDate.day,
      dateLabel: selectedDate.dateLabel,
      shift: scheduleForm.shift,
      time: selectedTemplate?.time || scheduleForm.shift,
      employee: scheduleForm.employee,
      sideworkWindow: scheduleForm.sideworkWindow || selectedTemplate?.sideworkWindow || "Open",
    };

    if (scheduleForm.id) {
      setScheduleState((prev) => prev.map((row) => (row.id === scheduleForm.id ? nextRow : row)));
    } else {
      setScheduleState((prev) => [...prev, nextRow]);
    }

    resetScheduleForm(selectedDate.dateLabel);
  }

  function addShiftTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!canManageSchedule) return;

    const cleanName = shiftTemplateForm.name.trim();
    const cleanStart = shiftTemplateForm.startTime.trim();
    const cleanEnd = shiftTemplateForm.endTime.trim();
    if (!cleanName || !cleanStart || !cleanEnd) return;

    const nextTemplate: ShiftTemplate = {
      id: shiftTemplateForm.id ?? Date.now(),
      name: cleanName,
      time: `${cleanStart} - ${cleanEnd}`,
      sideworkWindow: shiftTemplateForm.sideworkWindow,
      active: true,
    };

    if (shiftTemplateForm.id) {
      const oldTemplate = shiftTemplates.find((template) => template.id === shiftTemplateForm.id);
      setShiftTemplates((prev) => prev.map((template) => (template.id === shiftTemplateForm.id ? nextTemplate : template)));

      if (oldTemplate) {
        setScheduleState((prev) =>
          prev.map((shift) =>
            shift.shift === oldTemplate.name
              ? {
                  ...shift,
                  shift: nextTemplate.name,
                  time: nextTemplate.time,
                  sideworkWindow: nextTemplate.sideworkWindow,
                }
              : shift
          )
        );
        setPublishedSchedule((prev) =>
          prev.map((shift) =>
            shift.shift === oldTemplate.name
              ? {
                  ...shift,
                  shift: nextTemplate.name,
                  time: nextTemplate.time,
                  sideworkWindow: nextTemplate.sideworkWindow,
                }
              : shift
          )
        );
      }
    } else {
      setShiftTemplates((prev) => [...prev, nextTemplate]);
    }

    setScheduleForm((prev) => ({ ...prev, shift: nextTemplate.name, sideworkWindow: nextTemplate.sideworkWindow }));
    setShiftTemplateForm({ id: null, name: "", startTime: "10:00 AM", endTime: "4:00 PM", sideworkWindow: "Open" });
  }

  function startEditShiftTemplate(template: ShiftTemplate) {
    if (!canManageSchedule) return;
    const parts = template.time.split("-").map((part) => part.trim());
    setShiftTemplateForm({
      id: template.id,
      name: template.name,
      startTime: parts[0] || "10:00 AM",
      endTime: parts[1] || "4:00 PM",
      sideworkWindow: template.sideworkWindow,
    });
  }

  function cancelShiftTemplateEdit() {
    setShiftTemplateForm({ id: null, name: "", startTime: "10:00 AM", endTime: "4:00 PM", sideworkWindow: "Open" });
  }

  function toggleShiftTemplateActive(id: number) {
    if (!canManageSchedule) return;
    setShiftTemplates((prev) =>
      prev.map((template) =>
        template.id === id ? { ...template, active: template.active === false } : template
      )
    );
  }

  function deleteShiftTemplate(id: number) {
    if (!canManageSchedule) return;
    const targetTemplate = shiftTemplates.find((template) => template.id === id);
    if (!targetTemplate) return;

    const isDefaultTemplate = DEFAULT_SHIFT_TEMPLATES.some((template) => template.id === id);
    const isUsedOnSchedule = scheduleState.some((shift) => shift.shift === targetTemplate.name);

    if (isDefaultTemplate) {
      window.alert("Default Open, Mid, and Close shifts cannot be deleted.");
      return;
    }

    if (isUsedOnSchedule) {
      window.alert("This shift is already assigned on the schedule. Remove those shifts first, then delete the template.");
      return;
    }

    setShiftTemplates((prev) => prev.filter((template) => template.id !== id));
    if (shiftTemplateForm.id === id) cancelShiftTemplateEdit();
  }

  function addOrEditScheduleShift(e: React.FormEvent) {
    e.preventDefault();
    if (!canManageSchedule) return;

    const selectedDate = allScheduleDates.find((d) => d.dateLabel === scheduleForm.dateLabel);
    if (!selectedDate) return;

    const availabilityIssue = getAvailabilityIssue(
      scheduleForm.employee,
      selectedDate.day,
      scheduleForm.shift,
      availabilityRequests
    );
    if (availabilityIssue) {
      setOverrideWarning(
        `${availabilityIssue}

Do you want to override this and schedule ${scheduleForm.employee} anyway?`
      );
      setPendingScheduleSave(() => () => saveScheduleRow());
      return;
    }

    const requestOffIssue = getRequestOffIssue(
      scheduleForm.employee,
      selectedDate.dateLabel,
      scheduleForm.shift,
      requestOffs
    );
    if (requestOffIssue) {
      setOverrideWarning(
        `${requestOffIssue}

Do you want to override this and schedule ${scheduleForm.employee} anyway?`
      );
      setPendingScheduleSave(() => () => saveScheduleRow());
      return;
    }

    const alreadyHasShift = scheduleState.some(
      (row) =>
        row.id !== scheduleForm.id &&
        row.employee === scheduleForm.employee &&
        row.dateLabel === selectedDate.dateLabel
    );
    if (alreadyHasShift) {
      setOverrideWarning(
        `${scheduleForm.employee} is already scheduled on ${selectedDate.dateLabel}.

Do you want to override this and add another shift anyway?`
      );
      setPendingScheduleSave(() => () => saveScheduleRow());
      return;
    }

    saveScheduleRow();
  }

  function startEditShift(row: ShiftRow) {
    if (!canManageSchedule) return;
    const matchedTemplate = availableShiftTemplates.find((template) => template.name === row.shift);
    setScheduleForm({
      id: row.id,
      dateLabel: row.dateLabel,
      shift: row.shift,
      employee: row.employee,
      sideworkWindow: row.sideworkWindow || matchedTemplate?.sideworkWindow || "Open",
    });
    setActiveView("schedule");
  }

  function removeScheduleShift(id: number) {
    if (!canManageSchedule) return;
    setScheduleState((prev) => prev.filter((row) => row.id !== id));
    if (scheduleForm.id === id) resetScheduleForm();
  }

  function duplicateShift(row: ShiftRow) {
    if (!canManageSchedule) return;
    const allDates = [...WEEK_DATE_MAP.current, ...WEEK_DATE_MAP.next];
    const currentIndex = allDates.findIndex((d) => d.day === row.day && d.dateLabel === row.dateLabel);
    const nextWeekDay = allDates[currentIndex + 7];
    if (!nextWeekDay) return;

    const availabilityIssue = getAvailabilityIssue(row.employee, nextWeekDay.day, row.shift, availabilityRequests);
    if (availabilityIssue) {
      window.alert(availabilityIssue);
      return;
    }

    const requestOffIssue = getRequestOffIssue(row.employee, nextWeekDay.dateLabel, row.shift, requestOffs);
    if (requestOffIssue) {
      window.alert(requestOffIssue);
      return;
    }

    const alreadyExists = scheduleState.some(
      (shift) =>
        shift.day === nextWeekDay.day &&
        shift.dateLabel === nextWeekDay.dateLabel &&
        shift.employee === row.employee
    );
    if (alreadyExists) {
      window.alert(`${row.employee} already has a shift on ${nextWeekDay.dateLabel}.`);
      return;
    }

    setScheduleState((prev) => [
      ...prev,
      { ...row, id: Date.now(), day: nextWeekDay.day, dateLabel: nextWeekDay.dateLabel },
    ]);
  }

  function clearDay(day: CalendarDate) {
    if (!canManageSchedule) return;
    setScheduleState((prev) => prev.filter((row) => !(row.day === day.day && row.dateLabel === day.dateLabel)));
  }

  function copyCurrentToNextWeek() {
    if (!canManageSchedule) return;
    const sourceWeek = WEEK_DATE_MAP.current;
    const targetWeek = WEEK_DATE_MAP.next;
    const nextRows: ShiftRow[] = [];

    sourceWeek.forEach((sourceDay, index) => {
      const targetDay = targetWeek[index];
      const sourceShifts = scheduleState.filter(
        (row) => row.day === sourceDay.day && row.dateLabel === sourceDay.dateLabel
      );
      sourceShifts.forEach((shift, rowIndex) => {
        const availabilityIssue = getAvailabilityIssue(shift.employee, targetDay.day, shift.shift, availabilityRequests);
        const requestOffIssue = getRequestOffIssue(shift.employee, targetDay.dateLabel, shift.shift, requestOffs);
        const exists = scheduleState.some(
          (existing) =>
            existing.day === targetDay.day &&
            existing.dateLabel === targetDay.dateLabel &&
            existing.employee === shift.employee
        );
        if (availabilityIssue || requestOffIssue || exists) return;
        nextRows.push({
          ...shift,
          id: Date.now() + index * 10 + rowIndex,
          day: targetDay.day,
          dateLabel: targetDay.dateLabel,
        });
      });
    });

    if (nextRows.length) {
      setScheduleState((prev) => [...prev, ...nextRows]);
      setCalendarWeek("next");
    }
  }

  function autoScheduleVisibleWeek() {
    if (!canManageSchedule) return;

    const targetWeek = WEEK_DATE_MAP[calendarWeek];
    const nextRows: ShiftRow[] = [];
    const rotationPool = staffState.filter((member) => member.active);
    let rotationIndex = 0;

    targetWeek.forEach((day) => {
      shiftTemplates.forEach((template) => {
        const slotExists =
          scheduleState.some(
            (row) => row.day === day.day && row.dateLabel === day.dateLabel && row.shift === template.name
          ) ||
          nextRows.some(
            (row) => row.day === day.day && row.dateLabel === day.dateLabel && row.shift === template.name
          );

        if (slotExists) return;

        const allowedRoles = SHIFT_ROLE_MAP[template.name] || ROLES;
        const orderedCandidates = rotationPool
          .slice(rotationIndex)
          .concat(rotationPool.slice(0, rotationIndex))
          .filter((member) => allowedRoles.includes(member.role));

        const selected = orderedCandidates.find((member) => {
          const alreadyScheduledThatDay =
            scheduleState.some((row) => row.employee === member.name && row.dateLabel === day.dateLabel) ||
            nextRows.some((row) => row.employee === member.name && row.dateLabel === day.dateLabel);
          if (alreadyScheduledThatDay) return false;

          const availabilityIssue = getAvailabilityIssue(member.name, day.day, template.name, availabilityRequests);
          const requestOffIssue = getRequestOffIssue(member.name, day.dateLabel, template.name, requestOffs);
          return !availabilityIssue && !requestOffIssue;
        });

        if (!selected) return;

        nextRows.push({
          id: Date.now() + nextRows.length + 1,
          day: day.day,
          dateLabel: day.dateLabel,
          shift: template.name,
          time: template.time,
          employee: selected.name,
        });

        const selectedIndex = rotationPool.findIndex((member) => member.id === selected.id);
        if (selectedIndex >= 0) {
          rotationIndex = (selectedIndex + 1) % rotationPool.length;
        }
      });
    });

    if (!nextRows.length) {
      window.alert("No empty schedule slots could be auto-filled.");
      return;
    }

    setScheduleState((prev) => [...prev, ...nextRows]);
  }

  function addOrEditSidework(e: React.FormEvent) {
    e.preventDefault();
    if (!canManageSidework) return;
    const cleanTask = sideworkForm.task.trim();
    if (!cleanTask) return;

    setSideworkState((prev) => {
      const currentList = prev[sideworkForm.role] || [];
      const nextList = sideworkForm.id
        ? currentList.map((item) =>
            item.id === sideworkForm.id
              ? {
                  ...item,
                  task: cleanTask,
                  team: sideworkForm.team,
                  assignedTo: sideworkForm.role,
                  shiftWindow: sideworkForm.shiftWindow,
                  active: sideworkForm.active,
                }
              : item
          )
        : [
            ...currentList,
            {
              id: Date.now(),
              task: cleanTask,
              team: sideworkForm.team,
              assignedTo: sideworkForm.role,
              shiftWindow: sideworkForm.shiftWindow,
              active: sideworkForm.active,
            },
          ];
      return { ...prev, [sideworkForm.role]: nextList };
    });

    resetSideworkForm();
  }

  function startEditSidework(role: Role, item: SideworkItem) {
    if (!canManageSidework) return;
    setActiveView("sidework");
    setSideworkForm({
      id: item.id,
      role,
      task: item.task,
      team: item.team,

      shiftWindow: item.shiftWindow,
      active: item.active,
    });
  }

  function removeSidework(role: Role, id: number) {
    if (!canManageSidework) return;
    setSideworkState((prev) => ({ ...prev, [role]: prev[role].filter((item) => item.id !== id) }));
    setSideworkCompletionState((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (sideworkForm.id === id) resetSideworkForm();
  }

  function toggleSideworkCompletion(id: number) {
    if (!currentUser) return;

    const targetItem = allSideworkItems.find((item) => item.id === id);
    const timestamp = new Date().toLocaleString();

    setSideworkCompletionState((prev) => {
      const current = prev[id];
      const nextCompleted = current?.status !== "completed";
      return {
        ...prev,
        [id]: {
          completed: nextCompleted,
          completedBy: nextCompleted ? currentUser.name : null,
          completedAt: nextCompleted ? timestamp : null,
          status: nextCompleted ? "completed" : "pending",
          note: "",
        },
      };
    });

    if (targetItem && sideworkCompletionState[id]?.status !== "completed") {
      setSideworkLog((prev) => [
        {
          id: Date.now(),
          task: targetItem.task,
          employee: currentUser.name,
          role: targetItem.role,
          shift: targetItem.shiftWindow,
          completed: true,
          note: "",
          timestamp,
        },
        ...prev,
      ]);
    }
  }

  function submitMissedTask(itemId: number) {
    if (!currentUser) return;
    const targetItem = allSideworkItems.find((item) => item.id === itemId);
    const cleanNote = missedTaskDraft.note.trim();
    if (!targetItem || !cleanNote) return;

    const timestamp = new Date().toLocaleString();

    setSideworkCompletionState((prev) => ({
      ...prev,
      [itemId]: {
        completed: false,
        completedBy: currentUser.name,
        completedAt: timestamp,
        status: "missed",
        note: cleanNote,
      },
    }));

    setSideworkLog((prev) => [
      {
        id: Date.now(),
        task: targetItem.task,
        employee: currentUser.name,
        role: targetItem.role,
        shift: targetItem.shiftWindow,
        completed: false,
        note: cleanNote,
        timestamp,
      },
      ...prev,
    ]);

    setMissedTaskDraft({ itemId: null, note: "" });
  }

  function completeAllMySidework() {
    if (!currentUser) return;
    const timestamp = new Date().toLocaleString();
    const itemsToComplete = mySideworkItems.filter(
      (item) => sideworkCompletionState[item.id]?.status !== "completed"
    );
    if (!itemsToComplete.length) return;

    setSideworkCompletionState((prev) => {
      const next = { ...prev };
      itemsToComplete.forEach((item) => {
        next[item.id] = {
          completed: true,
          completedBy: currentUser.name,
          completedAt: timestamp,
          status: "completed",
          note: "",
        };
      });
      return next;
    });

    setSideworkLog((prev) => [
      ...itemsToComplete.map((item, index) => ({
        id: Date.now() + index,
        task: item.task,
        employee: currentUser.name,
        role: currentUser.role,
        shift: item.shiftWindow,
        completed: true,
        note: "",
        timestamp,
      })),
      ...prev,
    ]);
  }

  function markMissedReviewed(id: number) {
    setReviewedMissed((prev) => ({ ...prev, [id]: true }));
  }

  function submitAvailability(e: React.FormEvent) {
    e.preventDefault();
    setAvailabilityRequests((prev) => [
      {
        id: Date.now(),
        employee: availabilityForm.employee,
        day: availabilityForm.day,
        restriction: availabilityForm.restriction,
        status: "Pending Manager Approval",
      },
      ...prev,
    ]);
    setAvailabilityForm((prev) => ({ ...prev, day: "Monday", restriction: "Not available at all" }));
  }

  function updateAvailabilityStatus(id: number, status: string) {
    if (!canManageApprovals) return;
    setAvailabilityRequests((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)));
  }

  function removeAvailabilityRule(id: number) {
    if (!canManageApprovals) return;
    setAvailabilityRequests((prev) => prev.filter((item) => item.id !== id));
  }

  function submitRequestOff(e: React.FormEvent) {
    e.preventDefault();
    setRequestOffs((prev) => [
      {
        id: Date.now(),
        employee: requestOffForm.employee,
        date: requestOffForm.date,
        shift: requestOffForm.shift,
        note: requestOffForm.note.trim(),
        status: "Pending Manager Approval",
      },
      ...prev,
    ]);
    setRequestOffForm((prev) => ({ ...prev, date: WEEK_DATE_MAP.current[0].dateLabel, shift: "Open", note: "" }));
  }

  function updateRequestOffStatus(id: number, status: string) {
    if (!canManageApprovals) return;
    const target = requestOffs.find((item) => item.id === id);
    setRequestOffs((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)));
    if (status === "Approved" && target) {
      setScheduleState((prev) =>
        prev.filter((shift) => {
          if (shift.employee !== target.employee) return true;
          if (shift.dateLabel !== target.date) return true;
          if (target.shift === "All Day") return false;
          return shift.shift !== target.shift;
        })
      );
    }
  }

  function removeRequestOff(id: number) {
    if (!canManageApprovals) return;
    setRequestOffs((prev) => prev.filter((item) => item.id !== id));
  }

  function submitTradeRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!tradeForm.employee || !tradeForm.tradeWith || !tradeForm.shiftId) return;
    setTradeRequests((prev) => [
      {
        id: Date.now(),
        employee: tradeForm.employee,
        tradeWith: tradeForm.tradeWith,
        shiftId: Number(tradeForm.shiftId),
        requestedShift: tradeForm.requestedShift,
        note: tradeForm.note.trim(),
        status: "Pending Manager Approval",
      },
      ...prev,
    ]);
    setTradeForm((prev) => ({ ...prev, shiftId: "", tradeWith: "", requestedShift: "Open", note: "" }));
  }

  function updateTradeStatus(id: number, status: string) {
    if (!canManageApprovals) return;
    const target = tradeRequests.find((item) => item.id === id);
    setTradeRequests((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)));

    if (status === "Approved" && target) {
      const requesterShift = scheduleState.find((shift) => shift.id === target.shiftId);
      if (!requesterShift) return;
      const tradePartnerShift = scheduleState.find(
        (shift) =>
          shift.employee === target.tradeWith &&
          shift.dateLabel === requesterShift.dateLabel &&
          shift.day === requesterShift.day
      );
      if (tradePartnerShift) {
        setScheduleState((prev) =>
          prev.map((shift) => {
            if (shift.id === requesterShift.id) return { ...shift, employee: target.tradeWith };
            if (shift.id === tradePartnerShift.id) return { ...shift, employee: target.employee };
            return shift;
          })
        );
      } else {
        setScheduleState((prev) =>
          prev.map((shift) => (shift.id === requesterShift.id ? { ...shift, employee: target.tradeWith } : shift))
        );
      }
    }
  }

  function removeTradeRequest(id: number) {
    if (!canManageApprovals) return;
    setTradeRequests((prev) => prev.filter((item) => item.id !== id));
  }

  function addStaffMember(e: React.FormEvent) {
    e.preventDefault();
    if (!canManageStaff) return;
    const cleanName = staffForm.name.trim();
    const cleanPin = staffForm.pin.trim();
    if (!cleanName || cleanPin.length !== 4) return;
    setStaffState((prev) => [
      ...prev,
      {
        id: Date.now(),
        name: cleanName,
        role: staffForm.role,
        pin: cleanPin,
        active: true,
        permissions: getDefaultPermissionsForRole(staffForm.role),
      },
    ]);
    setStaffForm({ name: "", role: "Bartender", pin: "" });
  }

  function updateStaffRole(id: number, role: Role) {
    if (!canManageStaff) return;
    setStaffState((prev) =>
      prev.map((member) =>
        member.id === id
          ? {
              ...member,
              role,
              permissions: {
                ...getDefaultPermissionsForRole(role),
                ...(member.permissions || {}),
              },
            }
          : member
      )
    );
  }

  function toggleStaffPermission(id: number, permission: keyof StaffPermissions) {
    if (!canManageStaff) return;
    setStaffState((prev) =>
      prev.map((member) => {
        if (member.id !== id) return member;
        const currentPermissions = getStaffPermissions(member);
        return {
          ...member,
          permissions: {
            ...currentPermissions,
            [permission]: !currentPermissions[permission],
          },
        };
      })
    );
  }

  function toggleStaffActive(id: number) {
    if (!canManageStaff) return;
    setStaffState((prev) => prev.map((member) => (member.id === id ? { ...member, active: !member.active } : member)));
  }

  function removeStaffMember(id: number) {
    if (!canManageStaff) return;
    const target = staffState.find((member) => member.id === id);
    if (!target) return;
    const hasScheduledShifts = scheduleState.some((shift) => shift.employee === target.name);
    if (hasScheduledShifts) {
      window.alert("Cannot remove a staff member who still has scheduled shifts.");
      return;
    }
    setStaffState((prev) => prev.filter((member) => member.id !== id));
  }

  function saveCloudSettingsNow() {
    const nextConfig: CloudConfig = {
      ...cloudConfig,
      mode: "cloud",
      projectUrl: cloudConfig.projectUrl.trim(),
      anonKey: cloudConfig.anonKey.trim(),
      workspaceId: (cloudConfig.workspaceId || DEFAULT_CLOUD_CONFIG.workspaceId).trim(),
    };

    if (!nextConfig.projectUrl || !nextConfig.anonKey) {
      setCloudStatus("Enter project URL and publishable key first");
      window.alert("Add both the base Supabase project URL and the publishable key first.");
      return;
    }

    setCloudConfig(nextConfig);
    saveStoredState(STORAGE_KEYS.cloudConfig, nextConfig);
    setCloudStatus("Cloud settings saved — cloud mode enabled");
  }

  function switchToLocalMode() {
    const nextConfig: CloudConfig = {
      ...cloudConfig,
      mode: "local",
    };
    setCloudConfig(nextConfig);
    saveStoredState(STORAGE_KEYS.cloudConfig, nextConfig);
    setCloudStatus("Local save active");
  }

  async function pushCloudDataNow() {
    const workspaceId = (cloudConfig.workspaceId || DEFAULT_CLOUD_CONFIG.workspaceId).trim();

    if (cloudConfig.mode !== "cloud") {
      setCloudStatus("Switch to cloud mode before pushing");
      window.alert("Switch to cloud mode before pushing cloud data.");
      return;
    }

    if (!cloudConfig.projectUrl.trim() || !cloudConfig.anonKey.trim()) {
      setCloudStatus("Cloud settings missing");
      window.alert("Cloud settings are missing. Add the Supabase URL and publishable key first.");
      return;
    }

    setCloudBusy(true);
    setCloudStatus("Pushing current data to cloud...");

    try {
      await syncAllCloudData({
        cloudConfig,
        workspaceId,
        staffState,
        scheduleState,
        publishedSchedule,
        publishMeta,
        sideworkState,
        sideworkCompletionState,
        availabilityRequests,
        requestOffs,
        tradeRequests,
        sideworkLog,
        reviewedMissed,
      });
      setHasLoadedCloud(true);
      setCloudStatus("Cloud push complete");
    } catch {
      setCloudStatus("Cloud push failed — check Supabase settings");
      window.alert("Cloud push failed. Check the Supabase URL, publishable key, and table names.");
    } finally {
      setCloudBusy(false);
    }
  }

  async function refreshCloudDataNow(isAutoRefresh = false) {
    const workspaceId = (cloudConfig.workspaceId || DEFAULT_CLOUD_CONFIG.workspaceId).trim();

    if (isAutoRefresh && Date.now() - lastLocalEditAtRef.current < LOCAL_EDIT_GRACE_MS) {
      setCloudStatus("Live sync paused while saving your edit");
      return;
    }

    if (cloudConfig.mode !== "cloud") {
      setCloudStatus("Switch to cloud mode before refreshing");
      window.alert("Switch to cloud mode before refreshing cloud data.");
      return;
    }

    if (!cloudConfig.projectUrl.trim() || !cloudConfig.anonKey.trim()) {
      setCloudStatus("Cloud settings missing");
      window.alert("Cloud settings are missing. Add the Supabase URL and publishable key first.");
      return;
    }

    if (!isAutoRefresh) setCloudBusy(true);
    setCloudStatus(isAutoRefresh ? "Auto-refreshing cloud data..." : "Refreshing cloud data...");

    try {
      const cloudData = await loadAllCloudData({
        cloudConfig,
        workspaceId,
        fallback: {
          staffState,
          scheduleState,
          publishedSchedule,
          publishMeta,
          sideworkState,
          sideworkCompletionState,
          availabilityRequests,
          requestOffs,
          tradeRequests,
          sideworkLog,
          reviewedMissed,
        },
      });

      isApplyingCloudPullRef.current = true;
      setStaffState(cloudData.staffState);
      setScheduleState(cloudData.scheduleState);
      setPublishedSchedule(cloudData.publishedSchedule);
      setPublishMeta(cloudData.publishMeta);
      setSideworkState(cloudData.sideworkState);
      setSideworkCompletionState(cloudData.sideworkCompletionState);
      setAvailabilityRequests(cloudData.availabilityRequests);
      setRequestOffs(cloudData.requestOffs);
      setTradeRequests(cloudData.tradeRequests);
      setSideworkLog(cloudData.sideworkLog);
      setReviewedMissed(cloudData.reviewedMissed);
      setHasLoadedCloud(true);
      setLastLiveSyncAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }));
      setCloudStatus(isAutoRefresh ? "Live sync checked for updates" : "Cloud data refreshed");
      setTimeout(() => {
        isApplyingCloudPullRef.current = false;
      }, 300);
    } catch {
      setCloudStatus("Cloud refresh failed — check Supabase tables and keys");
      isApplyingCloudPullRef.current = false;
      if (!isAutoRefresh) {
        window.alert("Cloud refresh failed. Check the Supabase URL, publishable key, and table names.");
      }
    } finally {
      setCloudBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#f5efe7_0,#f5f5f4_35%,#e7e5e4_100%)] p-4 text-stone-900 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-stone-200/80 bg-white/95 p-5 shadow-[0_20px_60px_rgba(28,25,23,0.10)] backdrop-blur md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 inline-flex rounded-full bg-stone-950 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-100">Live Ops System</div>
            <h1 className="text-3xl font-black tracking-tight text-stone-950">MosesMcQueens Ops</h1>
            <p className="text-sm font-medium text-stone-600">Scheduling, sidework, approvals, staff tools, and cloud sync.</p>
            <p className="mt-1 text-xs font-medium text-stone-500">{formatFullDateTime(now)}</p>
            <p className="mt-1 text-[11px] text-stone-400">Today: {todayDayName}, {todayDateLabel}</p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 rounded-3xl bg-stone-50/80 p-2 ring-1 ring-stone-200/80">
            <TabButton label="Dashboard" active={activeView === "dashboard"} onClick={() => setActiveView("dashboard")} />
            <TabButton label="Schedule" active={activeView === "schedule"} onClick={() => setActiveView("schedule")} />
            <TabButton label="Sidework" active={activeView === "sidework"} onClick={() => setActiveView("sidework")} />
            <TabButton label="Availability" active={activeView === "availability"} onClick={() => setActiveView("availability")} />
            <TabButton label="Request Off" active={activeView === "requestOff"} onClick={() => setActiveView("requestOff")} />
            <TabButton label="Trade Shifts" active={activeView === "tradeShifts"} onClick={() => setActiveView("tradeShifts")} />
            {isLeadership ? <TabButton label="Approvals" active={activeView === "approvals"} onClick={() => setActiveView("approvals")} /> : null}
            {isLeadership ? <TabButton label="Staff" active={activeView === "staff"} onClick={() => setActiveView("staff")} /> : null}
            {currentUser ? (
              <>
                <span className="ml-1 rounded-full bg-stone-100 px-3 py-2 text-sm font-semibold text-stone-700 ring-1 ring-stone-200">{currentUser.name} ({currentUser.role})</span>
                <button type="button" onClick={handleLogout} className="rounded-full bg-stone-950 px-4 py-2 text-sm font-bold text-white shadow-sm">Logout</button>
              </>
            ) : (
              <button type="button" onClick={() => setShowLogin(true)} className="rounded-full bg-amber-300 px-4 py-2 text-sm font-bold text-stone-950 shadow-lg shadow-amber-900/20">Login</button>
            )}
        </div>
      </div>

        {showLogin ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-5 shadow-xl">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-stone-900">Staff Login</h2>
                <p className="text-sm text-stone-500">Enter your 4-digit PIN to continue.</p>
                <p className="mt-1 text-xs text-stone-400">Demo PINs: Chris 5678, Jay 1234, Dawn 4321</p>
              </div>
              <div className="space-y-3">
                <input
                  value={pin}
                  onChange={(e) => setPin(digitsOnly(e.target.value).slice(0, 4))}
                  placeholder="4-digit PIN"
                  className="w-full rounded-2xl border border-stone-300 bg-white px-3 py-2"
                  maxLength={4}
                />
                {loginError ? <p className="text-sm text-red-600">PIN not recognized. Try again.</p> : null}
                <div className="flex gap-2">
                  <button type="button" onClick={handleLogin} className="flex-1 rounded-2xl bg-stone-900 px-4 py-2 text-white">Login</button>
                  <button type="button" onClick={closeLogin} className="rounded-2xl bg-stone-200 px-4 py-2 text-stone-800">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {showCloudPinPrompt ? (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
              <h2 className="mb-2 text-lg font-bold text-stone-900">General Manager Approval</h2>
              <p className="mb-4 text-sm text-stone-600">
                Enter a General Manager PIN before pushing live cloud data.
              </p>

              <input
                value={cloudAdminPin}
                onChange={(e) => {
                  setCloudAdminPin(digitsOnly(e.target.value).slice(0, 4));
                  setCloudPinError(false);
                }}
                placeholder="GM PIN"
                maxLength={4}
                className="w-full rounded-2xl border border-stone-300 bg-white px-3 py-2 text-center text-lg tracking-[0.4em]"
              />

              {cloudPinError ? (
                <p className="mt-2 text-sm font-semibold text-red-600">Incorrect General Manager PIN.</p>
              ) : null}

              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCloudPinPrompt(false);
                    setCloudAdminPin("");
                    setCloudPinError(false);
                  }}
                  className="flex-1 rounded-2xl bg-stone-200 px-4 py-2 text-stone-800"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const gm = staffState.find(
                      (member) => member.active && member.role === "General Manager" && member.pin === cloudAdminPin
                    );

                    if (!gm) {
                      setCloudPinError(true);
                      return;
                    }

                    setShowCloudPinPrompt(false);
                    setCloudAdminPin("");
                    setCloudPinError(false);
                    void pushCloudDataNow();
                  }}
                  className="flex-1 rounded-2xl bg-amber-300 px-4 py-2 font-bold text-stone-950"
                >
                  Push Data
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {overrideWarning ? (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
    <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
      <h2 className="mb-3 text-lg font-bold text-stone-900">Scheduling Warning</h2>
      <p className="whitespace-pre-line text-sm text-stone-700">{overrideWarning}</p>

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={() => {
            setOverrideWarning(null);
            setPendingScheduleSave(null);
          }}
          className="flex-1 rounded-2xl bg-stone-200 px-4 py-2 text-stone-800"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={() => {
            if (pendingScheduleSave) {
              const savePendingSchedule = pendingScheduleSave;
              setOverrideWarning(null);
              setPendingScheduleSave(null);
              savePendingSchedule();
            }
          }}
          className="flex-1 rounded-2xl bg-red-600 px-4 py-2 text-white"
        >
          Override
        </button>
      </div>
    </div>
  </div>
) : null}

{showShiftSelector ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-5 shadow-xl">
              <h2 className="mb-3 text-lg font-semibold text-stone-900">Select Your Shift</h2>
              <div className="space-y-2">
                {["Open", "Mid", "Close"].map((shift) => (
                  <button
                    key={shift}
                    type="button"
                    onClick={() => {
                      setActiveShift(shift);
                      setSideworkFilter(shift);
                      setShowShiftSelector(false);
                      setActiveView("sidework");
                    }}
                    className="w-full rounded-2xl bg-stone-900 px-4 py-2 text-white"
                  >
                    {shift}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowShiftSelector(false)}
                className="mt-3 w-full rounded-2xl bg-stone-200 px-4 py-2 text-stone-800"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {activeView === "dashboard" ? (
          <div className="grid gap-6 lg:grid-cols-3">
            {isLeadership ? (
              <>
                <AppCard title="Overview">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SmallCard>
                      <p className="text-xs text-stone-500">Scheduled shifts</p>
                      <p className="text-2xl font-black">{totalScheduleCount}</p>
                    </SmallCard>
                    <SmallCard>
                      <p className="text-xs text-stone-500">Active staff</p>
                      <p className="text-2xl font-black">{activeStaffCount}</p>
                    </SmallCard>
                    <SmallCard>
                      <p className="text-xs text-stone-500">Sidework tasks</p>
                      <p className="text-2xl font-black">{sideworkCount}</p>
                    </SmallCard>
                    <SmallCard>
                      <p className="text-xs text-stone-500">Pending approvals</p>
                      <p className="text-2xl font-black">{pendingApprovalCount}</p>
                    </SmallCard>
                  </div>
                </AppCard>

                <AppCard title="Schedule Health">
                  <div className="space-y-3">
                    <SmallCard>
                      <p className="text-xs text-stone-500">Visible week</p>
                      <p className="font-black capitalize">{calendarWeek}</p>
                    </SmallCard>
                    <SmallCard>
                      <p className="text-xs text-stone-500">Shifts visible</p>
                      <p className="font-black">{shiftsThisWeek.length}</p>
                    </SmallCard>
                    <SmallCard>
                      <p className="text-xs text-stone-500">Conflict warnings</p>
                      <p className="font-black">{scheduleConflictCount}</p>
                    </SmallCard>
                  </div>
                </AppCard>
              </>
            ) : currentUser ? (
              <AppCard title="My Hours">
  <div className="space-y-3">
    <SmallCard>
      <p className="text-xs uppercase tracking-wide text-stone-500">This Week</p>
      <p className="mt-1 text-4xl font-black text-stone-950">{myWeeklyHours}</p>
      <p className="text-sm text-stone-500">Scheduled hours this week</p>
    </SmallCard>

    <SmallCard>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-stone-500">Current Pay Period</p>
          <p className="mt-1 text-4xl font-black text-stone-950">{myPayPeriodHours}</p>
          <p className="text-sm text-stone-500">Scheduled pay period hours</p>
        </div>

        <div className="rounded-2xl bg-stone-100 px-3 py-2 text-right ring-1 ring-stone-200">
          <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500">Pay Period</p>
          <p className="text-sm font-bold text-stone-900">{myPayPeriodLabel}</p>
        </div>
      </div>
    </SmallCard>
  </div>
</AppCard>
            ) : (
              <AppCard title="Staff Dashboard">
                <p className="text-sm text-stone-600">Login to view your shifts, weekly hours, monthly hours, and sidework progress.</p>
              </AppCard>
            )}

            {canAccessCloudSync ? (
              <AppCard title="Cloud Sync">
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-stone-700">{cloudStatus}</p>
                  <p className="text-xs text-stone-500">{realtimeStatus}</p>
                  {lastLiveSyncAt ? <p className="text-xs text-stone-400">Last live sync: {lastLiveSyncAt}</p> : null}
                  <button
                    type="button"
                    onClick={() => void refreshCloudDataNow(false)}
                    disabled={cloudBusy}
                    className="w-full rounded-2xl bg-stone-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                  >
                    Refresh Cloud Data
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCloudAdminPin("");
                      setCloudPinError(false);
                      setShowCloudPinPrompt(true);
                    }}
                    disabled={cloudBusy}
                    className="w-full rounded-2xl bg-amber-300 px-4 py-2 text-sm font-bold text-stone-950 disabled:opacity-50"
                  >
                    Push Current Data
                  </button>
                </div>
              </AppCard>
            ) : null}

            {!currentUser ? (
              <AppCard title="Staff Access">
                <p className="mb-3 text-sm text-stone-600">Login to unlock staff tools, schedules, sidework, requests, and management permissions.</p>
                <button type="button" onClick={() => setShowLogin(true)} className="rounded-2xl bg-stone-950 px-4 py-2 text-sm font-bold text-white">Login</button>
              </AppCard>
            ) : !isLeadership ? (
              <AppCard title="My Next Shifts">
                <div className="space-y-3">
                  {myNextShift ? (
                    <SmallCard>
                      <p className="font-bold">{myNextShift.day}, {myNextShift.dateLabel}</p>
                      <p className="text-sm text-stone-500">{myNextShift.shift} · {myNextShift.time}</p>
                    </SmallCard>
                  ) : (
                    <EmptyState text="No upcoming published shift found." />
                  )}
                  {myFollowingShift ? (
                    <SmallCard>
                      <p className="font-bold">Following: {myFollowingShift.day}, {myFollowingShift.dateLabel}</p>
                      <p className="text-sm text-stone-500">{myFollowingShift.shift} · {myFollowingShift.time}</p>
                    </SmallCard>
                  ) : null}
                </div>
              </AppCard>
            ) : (
              <AppCard title="Manager Tools">
                <div className="space-y-2">
                  <button type="button" onClick={() => setActiveView("schedule")} className="w-full rounded-2xl bg-stone-900 px-4 py-2 text-white">Manage Schedule</button>
                  <button type="button" onClick={() => setActiveView("approvals")} className="w-full rounded-2xl bg-amber-300 px-4 py-2 font-bold text-stone-950">Review Approvals</button>
                </div>
              </AppCard>
            )}
          </div>
        ) : null}

        {activeView === "schedule" ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
            <AppCard title={canManageSchedule ? "Schedule Tools" : "Published Schedule"}>
              <div className="mb-4 flex flex-wrap gap-2">
                <TabButton label="Previous Week" active={calendarWeek === "previous"} onClick={() => setCalendarWeek("previous")} />
                <TabButton label="Current Week" active={calendarWeek === "current"} onClick={() => setCalendarWeek("current")} />
                <TabButton label="Next Week" active={calendarWeek === "next"} onClick={() => setCalendarWeek("next")} />
              </div>

              {canManageSchedule ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowScheduleBuilder((prev) => !prev)}
                    className="mb-3 flex w-full items-center justify-between rounded-2xl bg-stone-950 px-4 py-3 text-left text-sm font-black text-white"
                  >
                    <span>{showScheduleBuilder ? "Hide Build Schedule" : "Build / Add Shift"}</span>
                    <span>{showScheduleBuilder ? "−" : "+"}</span>
                  </button>

                  {showScheduleBuilder ? (
                    <form onSubmit={addOrEditScheduleShift} className="space-y-3">
                    <select value={scheduleForm.dateLabel} onChange={(e) => setScheduleForm((prev) => ({ ...prev, dateLabel: e.target.value }))} className="w-full rounded-2xl border border-stone-300 px-3 py-2">
                      {allScheduleDates.map((day) => <option key={`${day.day}-${day.dateLabel}`} value={day.dateLabel}>{day.day} · {day.dateLabel}</option>)}
                    </select>
                    <select
                      value={scheduleForm.shift}
                      onChange={(e) => {
                        const selectedTemplate = availableShiftTemplates.find((template) => template.name === e.target.value);
                        setScheduleForm((prev) => ({
                          ...prev,
                          shift: e.target.value,
                          sideworkWindow: selectedTemplate?.sideworkWindow || prev.sideworkWindow,
                        }));
                      }}
                      className="w-full rounded-2xl border border-stone-300 px-3 py-2"
                    >
                      {activeShiftTemplates.map((shift) => (
                        <option key={shift.id} value={shift.name}>{shift.name} · {shift.time} · {shift.sideworkWindow} Sidework</option>
                      ))}
                    </select>
                    <select value={scheduleForm.employee} onChange={(e) => setScheduleForm((prev) => ({ ...prev, employee: e.target.value }))} className="w-full rounded-2xl border border-stone-300 px-3 py-2">
                      {staffState.filter((m) => m.active).map((member) => <option key={member.id} value={member.name}>{member.name} · {member.role}</option>)}
                    </select>
                    <select
                      value={scheduleForm.sideworkWindow}
                      onChange={(e) => setScheduleForm((prev) => ({ ...prev, sideworkWindow: e.target.value as "Open" | "Mid" | "Close" }))}
                      className="w-full rounded-2xl border border-stone-300 px-3 py-2"
                    >
                      <option value="Open">Show Open sidework</option>
                      <option value="Mid">Show Mid sidework</option>
                      <option value="Close">Show Close sidework</option>
                    </select>
                    <p className="text-xs text-stone-500">This controls which sidework group staff see for this shift.</p>
                    <button type="submit" className="w-full rounded-2xl bg-stone-950 px-4 py-2 text-sm font-bold text-white">{scheduleForm.id ? "Update Shift" : "Add Shift"}</button>
                    {scheduleForm.id ? <button type="button" onClick={() => resetScheduleForm()} className="w-full rounded-2xl bg-stone-200 px-4 py-2 text-sm font-bold text-stone-800">Cancel Edit</button> : null}
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button type="button" onClick={publishSchedule} className="rounded-2xl bg-amber-300 px-4 py-2 text-sm font-bold text-stone-950">Publish Schedule</button>
                      <button type="button" onClick={copyCurrentToNextWeek} className="rounded-2xl bg-stone-200 px-4 py-2 text-sm font-bold text-stone-800">Copy Current to Next</button>
                      <button type="button" onClick={autoScheduleVisibleWeek} className="rounded-2xl bg-stone-900 px-4 py-2 text-sm font-bold text-white sm:col-span-2">Auto Schedule Visible Week</button>
                    </div>
                    {publishMeta.lastPublishedAt ? <p className="text-xs text-stone-500">Last published: {publishMeta.lastPublishedAt}</p> : null}
                    </form>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => setShowShiftTemplates((prev) => !prev)}
                    className="mt-3 flex w-full items-center justify-between rounded-2xl bg-stone-100 px-4 py-3 text-left text-sm font-black text-stone-900 ring-1 ring-stone-200"
                  >
                    <span>{showShiftTemplates ? "Hide Shift Templates" : "Manage Shift Templates"}</span>
                    <span>{showShiftTemplates ? "−" : "+"}</span>
                  </button>

                  {showShiftTemplates ? (
                    <div className="mt-3 rounded-3xl border border-stone-200 bg-stone-50 p-4">
                    <h3 className="mb-3 text-sm font-black text-stone-900">Shift Templates</h3>
                    {shiftTemplateForm.id ? (
                      <div className="mb-3 rounded-2xl bg-amber-50 p-3 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">
                        Editing shift template. Saving will update existing scheduled shifts using this template.
                      </div>
                    ) : null}
                    <form onSubmit={addShiftTemplate} className="space-y-2">
                      <input
                        value={shiftTemplateForm.name}
                        onChange={(e) => setShiftTemplateForm((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="Shift name, ex: 10-4"
                        className="w-full rounded-2xl border border-stone-300 px-3 py-2"
                      />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input
                          value={shiftTemplateForm.startTime}
                          onChange={(e) => setShiftTemplateForm((prev) => ({ ...prev, startTime: e.target.value }))}
                          placeholder="Start, ex: 10:00 AM"
                          className="w-full rounded-2xl border border-stone-300 px-3 py-2"
                        />
                        <input
                          value={shiftTemplateForm.endTime}
                          onChange={(e) => setShiftTemplateForm((prev) => ({ ...prev, endTime: e.target.value }))}
                          placeholder="End, ex: 4:00 PM"
                          className="w-full rounded-2xl border border-stone-300 px-3 py-2"
                        />
                      </div>
                      <select
                        value={shiftTemplateForm.sideworkWindow}
                        onChange={(e) => setShiftTemplateForm((prev) => ({ ...prev, sideworkWindow: e.target.value as "Open" | "Mid" | "Close" }))}
                        className="w-full rounded-2xl border border-stone-300 px-3 py-2"
                      >
                        <option value="Open">Assign Open sidework</option>
                        <option value="Mid">Assign Mid sidework</option>
                        <option value="Close">Assign Close sidework</option>
                      </select>
                      <button type="submit" className="w-full rounded-2xl bg-stone-900 px-4 py-2 text-sm font-bold text-white">
                        {shiftTemplateForm.id ? "Save Shift Template" : "Create Shift Template"}
                      </button>
                      {shiftTemplateForm.id ? (
                        <button
                          type="button"
                          onClick={cancelShiftTemplateEdit}
                          className="w-full rounded-2xl bg-stone-200 px-4 py-2 text-sm font-bold text-stone-800"
                        >
                          Cancel Edit
                        </button>
                      ) : null}
                    </form>
                    <div className="mt-4 space-y-2">
                      {shiftTemplates.map((template) => {
                        const isDefaultTemplate = DEFAULT_SHIFT_TEMPLATES.some((item) => item.id === template.id);
                        const isActive = template.active !== false;
                        return (
                          <SmallCard key={template.id}>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-bold">{template.name}</p>
                                  {isDefaultTemplate ? (
                                    <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-500">Default</span>
                                  ) : null}
                                  <span
                                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                                      isActive ? "bg-green-100 text-green-700" : "bg-red-50 text-red-600"
                                    }`}
                                  >
                                    {isActive ? "Visible" : "Hidden"}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-stone-500">{template.time} · {template.sideworkWindow} sidework</p>
                                <p className="mt-1 text-xs text-stone-400">
                                  {isActive ? "Shows in the schedule dropdown." : "Hidden from the schedule dropdown."}
                                </p>
                              </div>

                              <div className="flex flex-wrap gap-1">
                                <button
                                  type="button"
                                  onClick={() => startEditShiftTemplate(template)}
                                  className="rounded-full bg-stone-900 px-3 py-1 text-xs font-bold text-white"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleShiftTemplateActive(template.id)}
                                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                                    isActive ? "bg-stone-200 text-stone-700" : "bg-green-100 text-green-700"
                                  }`}
                                >
                                  {isActive ? "Hide" : "Show"}
                                </button>
                                {!isDefaultTemplate ? (
                                  <button
                                    type="button"
                                    onClick={() => deleteShiftTemplate(template.id)}
                                    className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-600"
                                  >
                                    Delete
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </SmallCard>
                        );
                      })}
                    </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-stone-600">Choose whether you want to see only your shifts or the full team schedule.</p>
                  <div className="flex rounded-2xl bg-stone-100 p-1 ring-1 ring-stone-200">
                    <button
                      type="button"
                      onClick={() => setStaffScheduleMode("mine")}
                      className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold ${
                        staffScheduleMode === "mine" ? "bg-stone-950 text-white" : "text-stone-600"
                      }`}
                    >
                      My Shifts
                    </button>
                    <button
                      type="button"
                      onClick={() => setStaffScheduleMode("team")}
                      className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold ${
                        staffScheduleMode === "team" ? "bg-stone-950 text-white" : "text-stone-600"
                      }`}
                    >
                      Team Schedule
                    </button>
                  </div>
                  {staffScheduleMode === "mine" ? (
                    myPublishedThisWeek.length ? myPublishedThisWeek.map((shift) => (
                      <SmallCard key={`mine-${shift.id}`}><p className="font-bold">{shift.day}, {shift.dateLabel}</p><p className="text-sm text-stone-500">{shift.shift} · {shift.time}</p></SmallCard>
                    )) : <EmptyState text="No personal published shifts for this selected week." />
                  ) : (
                    <p className="rounded-2xl bg-stone-50 p-3 text-sm text-stone-500 ring-1 ring-stone-200">Team schedule is shown below by day.</p>
                  )}
                </div>
              )}
            </AppCard>

            <AppCard title={isLeadership ? "Manager Schedule View" : "My Team Schedule"}>
              <div className="space-y-4">
                {visibleScheduleDays.map((day) => {
                  const scheduleRowsForView = isLeadership ? visibleScheduleSource : staffVisibleScheduleSource;
                  const dayShifts = scheduleRowsForView.filter((row) => row.day === day.day && row.dateLabel === day.dateLabel);
                  return (
                    <div key={`${day.day}-${day.dateLabel}`} className="rounded-3xl border border-stone-200 bg-stone-50/80 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div><p className="font-black text-stone-900">{day.day}</p><p className="text-sm text-stone-500">{day.dateLabel} · {dayShifts.length} shift{dayShifts.length === 1 ? "" : "s"}</p></div>
                        {canManageSchedule ? <button type="button" onClick={() => clearDay(day)} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-red-600 ring-1 ring-red-100">Clear Day</button> : null}
                      </div>
                      {dayShifts.length ? (
                        <div className="space-y-3">
                          {dayShifts.map((shift) => {
                            const alert = scheduleAlerts[shift.id];
                            return (
                              <SmallCard
                                key={shift.id}
                                className={
                                  shift.sideworkWindow === "Open"
                                    ? "border-l-4 border-amber-400"
                                    : shift.sideworkWindow === "Mid"
                                    ? "border-l-4 border-sky-400"
                                    : "border-l-4 border-stone-700"
                                }
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div className="mb-1 flex items-center gap-2">
                                      <span
                                        className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
                                          shift.sideworkWindow === "Open"
                                            ? "bg-amber-100 text-amber-900"
                                            : shift.sideworkWindow === "Mid"
                                            ? "bg-sky-100 text-sky-900"
                                            : "bg-stone-200 text-stone-900"
                                        }`}
                                      >
                                        {shift.sideworkWindow || shift.shift}
                                      </span>

                                      {publishedSchedule.some((published) => published.id === shift.id) ? (
                                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
                                          Published
                                        </span>
                                      ) : isLeadership ? (
                                        <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-bold text-stone-600">
                                          Draft
                                        </span>
                                      ) : null}
                                    </div>

                                    <p className="font-bold">{shift.shift} · {shift.employee}</p>
                                  {(() => {
                                    const role = getEmployeeRole(shift.employee, staffState);
                                    return role ? (
                                      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${getRoleBadgeClass(role)}`}>
                                        {role}
                                      </span>
                                    ) : null;
                                  })()}
                                  <p className="mt-1 text-sm text-stone-500">{shift.time}</p>

                                  {!isLeadership ? (
                                    <p className="mt-1 text-xs text-stone-400">
                                      Working with:{" "}
                                      {visibleScheduleSource
                                        .filter(
                                          (coworker) =>
                                            coworker.day === shift.day &&
                                            coworker.dateLabel === shift.dateLabel &&
                                            coworker.id !== shift.id &&
                                            shiftsOverlap(shift.time, coworker.time)
                                        )
                                        .map((coworker) => coworker.employee)
                                        .join(", ") || "No overlapping staff assigned"}
                                    </p>
                                  ) : (
                                    <p className="text-xs text-stone-400">
                                      Sidework Group: {shift.sideworkWindow || shift.shift}
                                    </p>
                                  )}
                                </div>
                                  {canManageSchedule ? <div className="flex gap-1"><button type="button" onClick={() => startEditShift(shift)} className="rounded-full bg-stone-900 px-2 py-1 text-xs text-white">Edit</button><button type="button" onClick={() => duplicateShift(shift)} className="rounded-full bg-amber-200 px-2 py-1 text-xs font-bold text-stone-900">Next</button><button type="button" onClick={() => removeScheduleShift(shift.id)} className="rounded-full bg-red-50 px-2 py-1 text-xs font-bold text-red-600">Del</button></div> : null}
                                </div>
                                {alert?.availabilityIssue || alert?.requestOffIssue || alert?.doubleBooked ? <div className="mt-2 rounded-2xl bg-red-50 p-2 text-xs text-red-700">{alert.availabilityIssue || alert.requestOffIssue || "Double booked warning."}</div> : null}
                              </SmallCard>
                            );
                          })}
                        </div>
                      ) : <EmptyState text="No shifts for this day." />}
                    </div>
                  );
                })}
              </div>
            </AppCard>
          </div>
        ) : null}

        {activeView === "sidework" ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
            <AppCard title="Sidework Tools">
              {currentUser ? (
                <div className="space-y-4">
                  {!isLeadership ? (
                    <>
                      <div className="rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-200"><p className="text-sm font-bold">My progress: {mySideworkProgress.completed}/{mySideworkProgress.total}</p><div className="mt-2 h-3 rounded-full bg-stone-200"><div className="h-3 rounded-full bg-amber-300" style={{ width: `${mySideworkProgress.percent}%` }} /></div></div>
                      <div className="flex flex-wrap gap-2"><TabButton label="All" active={sideworkFilter === "All"} onClick={() => setSideworkFilter("All")} />{["Open", "Mid", "Close"].map((shift) => <TabButton key={shift} label={shift} active={sideworkFilter === shift} onClick={() => setSideworkFilter(shift)} />)}</div>
                      <button type="button" onClick={completeAllMySidework} className="w-full rounded-2xl bg-stone-950 px-4 py-2 text-sm font-bold text-white">Complete All Visible</button>
                    </>
                  ) : (
                    <form onSubmit={addOrEditSidework} className="space-y-3">
                      <select value={sideworkForm.role} onChange={(e) => setSideworkForm((prev) => ({ ...prev, role: e.target.value as Role }))} className="w-full rounded-2xl border px-3 py-2">{ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select>
                      <input value={sideworkForm.task} onChange={(e) => setSideworkForm((prev) => ({ ...prev, task: e.target.value }))} placeholder="Task" className="w-full rounded-2xl border px-3 py-2" />
                      <select value={sideworkForm.team} onChange={(e) => setSideworkForm((prev) => ({ ...prev, team: e.target.value }))} className="w-full rounded-2xl border px-3 py-2">{TEAM_OPTIONS.map((item) => <option key={item}>{item}</option>)}</select>
                      
                      <select value={sideworkForm.shiftWindow} onChange={(e) => setSideworkForm((prev) => ({ ...prev, shiftWindow: e.target.value }))} className="w-full rounded-2xl border px-3 py-2">{SIDEWORK_SHIFT_OPTIONS.map((item) => <option key={item}>{item}</option>)}</select>
                      <button type="submit" className="w-full rounded-2xl bg-stone-950 px-4 py-2 text-sm font-bold text-white">{sideworkForm.id ? "Update Task" : "Add Task"}</button>
                    </form>
                  )}
                </div>
              ) : <EmptyState text="Login to use sidework." />}
            </AppCard>
            <AppCard title={isLeadership ? "All Sidework" : "My Sidework"}>
              {!currentUser ? <EmptyState text="Login to view sidework." /> : isLeadership ? (
                <div className="space-y-4">{ROLES.map((role) => <div key={role}><h3 className="mb-2 font-black">{role}</h3><div className="grid gap-2 md:grid-cols-2">{(sideworkState[role] || []).map((item) => <SmallCard key={item.id}><p className="font-bold">{item.task}</p><p className="text-xs text-stone-500">{item.team} · {item.shiftWindow}</p><div className="mt-2 flex gap-1"><button onClick={() => startEditSidework(role, item)} className="rounded-full bg-stone-900 px-2 py-1 text-xs text-white">Edit</button><button onClick={() => removeSidework(role, item.id)} className="rounded-full bg-red-50 px-2 py-1 text-xs font-bold text-red-600">Delete</button></div></SmallCard>)}</div></div>)}</div>
              ) : (
                <div className="space-y-3">{mySideworkItems.length ? mySideworkItems.map((item) => { const state = sideworkCompletionState[item.id]; return <SmallCard key={item.id}><p className="font-bold">{item.task}</p><p className="text-xs text-stone-500">{item.team} · {item.shiftWindow}</p><div className="mt-2 flex flex-wrap gap-2"><button onClick={() => toggleSideworkCompletion(item.id)} className={`rounded-full px-3 py-1 text-xs font-bold ${state?.status === "completed" ? "bg-green-100 text-green-700" : "bg-stone-900 text-white"}`}>{state?.status === "completed" ? "Completed" : "Mark Complete"}</button><button onClick={() => setMissedTaskDraft({ itemId: item.id, note: "" })} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-stone-900">Mark Missed</button></div>{missedTaskDraft.itemId === item.id ? <div className="mt-2 space-y-2"><input value={missedTaskDraft.note} onChange={(e) => setMissedTaskDraft((prev) => ({ ...prev, note: e.target.value }))} placeholder="Reason / note" className="w-full rounded-2xl border px-3 py-2 text-sm" /><button onClick={() => submitMissedTask(item.id)} className="rounded-full bg-stone-900 px-3 py-1 text-xs font-bold text-white">Submit Missed</button></div> : null}</SmallCard>; }) : <EmptyState text="No sidework for this selection." />}</div>
              )}
            </AppCard>
          </div>
        ) : null}

        {activeView === "availability" ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
            <AppCard title="Submit Availability">
              {currentUser ? <form onSubmit={submitAvailability} className="space-y-3"><select value={availabilityForm.employee} onChange={(e) => setAvailabilityForm((prev) => ({ ...prev, employee: e.target.value }))} className="w-full rounded-2xl border px-3 py-2">{staffState.filter((m) => m.active).map((m) => <option key={m.id}>{m.name}</option>)}</select><select value={availabilityForm.day} onChange={(e) => setAvailabilityForm((prev) => ({ ...prev, day: e.target.value }))} className="w-full rounded-2xl border px-3 py-2">{DAY_OPTIONS.map((d) => <option key={d}>{d}</option>)}</select><select value={availabilityForm.restriction} onChange={(e) => setAvailabilityForm((prev) => ({ ...prev, restriction: e.target.value }))} className="w-full rounded-2xl border px-3 py-2">{AVAILABILITY_OPTIONS.map((d) => <option key={d}>{d}</option>)}</select><button className="w-full rounded-2xl bg-stone-950 px-4 py-2 text-sm font-bold text-white">Submit</button></form> : <EmptyState text="Login to submit availability." />}
            </AppCard>
            <AppCard title="Availability Requests"><div className="space-y-2">{availabilityRequests.map((item) => <SmallCard key={item.id}><p className="font-bold">{item.employee} · {item.day}</p><p className="text-sm text-stone-500">{item.restriction}</p><p className="text-xs font-bold text-amber-700">{item.status}</p>{canManageApprovals ? <div className="mt-2 flex gap-2"><button onClick={() => updateAvailabilityStatus(item.id, "Approved")} className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">Approve</button><button onClick={() => updateAvailabilityStatus(item.id, "Denied")} className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">Deny</button><button onClick={() => removeAvailabilityRule(item.id)} className="rounded-full bg-stone-200 px-3 py-1 text-xs font-bold">Remove</button></div> : null}</SmallCard>)}</div></AppCard>
          </div>
        ) : null}

        {activeView === "requestOff" ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_2fr]"><AppCard title="Request Off">{currentUser ? <form onSubmit={submitRequestOff} className="space-y-3"><select value={requestOffForm.employee} onChange={(e) => setRequestOffForm((prev) => ({ ...prev, employee: e.target.value }))} className="w-full rounded-2xl border px-3 py-2">{staffState.filter((m) => m.active).map((m) => <option key={m.id}>{m.name}</option>)}</select><select value={requestOffForm.date} onChange={(e) => setRequestOffForm((prev) => ({ ...prev, date: e.target.value }))} className="w-full rounded-2xl border px-3 py-2">{allScheduleDates.map((d) => <option key={`${d.day}-${d.dateLabel}`} value={d.dateLabel}>{d.day} · {d.dateLabel}</option>)}</select><select value={requestOffForm.shift} onChange={(e) => setRequestOffForm((prev) => ({ ...prev, shift: e.target.value }))} className="w-full rounded-2xl border px-3 py-2">{REQUEST_OFF_OPTIONS.map((o) => <option key={o}>{o}</option>)}</select><input value={requestOffForm.note} onChange={(e) => setRequestOffForm((prev) => ({ ...prev, note: e.target.value }))} placeholder="Note" className="w-full rounded-2xl border px-3 py-2" /><button className="w-full rounded-2xl bg-stone-950 px-4 py-2 text-white">Submit</button></form> : <EmptyState text="Login to request off." />}</AppCard><AppCard title="Request Off List"><div className="space-y-2">{requestOffs.map((item) => <SmallCard key={item.id}><p className="font-bold">{item.employee} · {item.date}</p><p className="text-sm text-stone-500">{item.shift} · {item.note}</p><p className="text-xs font-bold text-amber-700">{item.status}</p>{canManageApprovals ? <div className="mt-2 flex gap-2"><button onClick={() => updateRequestOffStatus(item.id, "Approved")} className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">Approve</button><button onClick={() => updateRequestOffStatus(item.id, "Denied")} className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">Deny</button><button onClick={() => removeRequestOff(item.id)} className="rounded-full bg-stone-200 px-3 py-1 text-xs font-bold">Remove</button></div> : null}</SmallCard>)}</div></AppCard></div>
        ) : null}

        {activeView === "tradeShifts" ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_2fr]"><AppCard title="Trade Shift Request">{currentUser ? <form onSubmit={submitTradeRequest} className="space-y-3"><select value={tradeForm.employee} onChange={(e) => setTradeForm((prev) => ({ ...prev, employee: e.target.value }))} className="w-full rounded-2xl border px-3 py-2">{staffState.filter((m) => m.active).map((m) => <option key={m.id}>{m.name}</option>)}</select><select value={tradeForm.shiftId} onChange={(e) => setTradeForm((prev) => ({ ...prev, shiftId: e.target.value }))} className="w-full rounded-2xl border px-3 py-2"><option value="">Select shift</option>{publishedSchedule.map((s) => <option key={s.id} value={s.id}>{s.employee} · {s.day} {s.dateLabel} · {s.shift}</option>)}</select><select value={tradeForm.tradeWith} onChange={(e) => setTradeForm((prev) => ({ ...prev, tradeWith: e.target.value }))} className="w-full rounded-2xl border px-3 py-2"><option value="">Trade with</option>{staffState.filter((m) => m.active).map((m) => <option key={m.id}>{m.name}</option>)}</select><select value={tradeForm.requestedShift} onChange={(e) => setTradeForm((prev) => ({ ...prev, requestedShift: e.target.value }))} className="w-full rounded-2xl border px-3 py-2">{REQUEST_OFF_OPTIONS.filter((o) => o !== "All Day").map((o) => <option key={o}>{o}</option>)}</select><input value={tradeForm.note} onChange={(e) => setTradeForm((prev) => ({ ...prev, note: e.target.value }))} placeholder="Note" className="w-full rounded-2xl border px-3 py-2" /><button className="w-full rounded-2xl bg-stone-950 px-4 py-2 text-white">Submit Trade</button></form> : <EmptyState text="Login to trade shifts." />}</AppCard><AppCard title="Trade Requests"><div className="space-y-2">{tradeRequests.map((item) => {
                const requestedShiftRow = publishedSchedule.find((shift) => shift.id === item.shiftId) || scheduleState.find((shift) => shift.id === item.shiftId);
                const tradePartnerSameDayShift = requestedShiftRow
                  ? publishedSchedule.find(
                      (shift) =>
                        shift.employee === item.tradeWith &&
                        shift.day === requestedShiftRow.day &&
                        shift.dateLabel === requestedShiftRow.dateLabel
                    ) ||
                    scheduleState.find(
                      (shift) =>
                        shift.employee === item.tradeWith &&
                        shift.day === requestedShiftRow.day &&
                        shift.dateLabel === requestedShiftRow.dateLabel
                    )
                  : null;

                return (
                  <SmallCard key={item.id}>
                    <p className="font-bold">{item.employee} → {item.tradeWith}</p>
                    {requestedShiftRow ? (
                      <div className="mt-1 rounded-2xl bg-stone-50 p-2 text-sm text-stone-600 ring-1 ring-stone-100">
                        <p className="font-semibold text-stone-800">Shift being traded:</p>
                        <p>{requestedShiftRow.day}, {requestedShiftRow.dateLabel}</p>
                        <p>{requestedShiftRow.shift} · {requestedShiftRow.time}</p>
                        {tradePartnerSameDayShift ? (
                          <p className="mt-1 text-xs text-stone-500">
                            {item.tradeWith}'s same-day shift: {tradePartnerSameDayShift.shift} · {tradePartnerSameDayShift.time}
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-stone-500">{item.tradeWith} has no same-day shift listed.</p>
                        )}
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-red-600">Original shift could not be found.</p>
                    )}
                    <p className="mt-2 text-sm text-stone-500">Requested: {item.requestedShift} · {item.note || "No note"}</p>
                    <p className="text-xs font-bold text-amber-700">{item.status}</p>
                    {canManageApprovals ? (
                      <div className="mt-2 flex gap-2">
                        <button onClick={() => updateTradeStatus(item.id, "Approved")} className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">Approve</button>
                        <button onClick={() => updateTradeStatus(item.id, "Denied")} className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">Deny</button>
                        <button onClick={() => removeTradeRequest(item.id)} className="rounded-full bg-stone-200 px-3 py-1 text-xs font-bold">Remove</button>
                      </div>
                    ) : null}
                  </SmallCard>
                );
              })}</div></AppCard></div>
        ) : null}

        {activeView === "approvals" && canManageApprovals ? (
          <div className="grid gap-6 lg:grid-cols-3"><AppCard title="Pending Availability"><div className="space-y-2">{availabilityRequests.filter((i) => i.status === "Pending Manager Approval").map((item) => <SmallCard key={item.id}><p className="font-bold">{item.employee}</p><p className="text-sm">{item.day} · {item.restriction}</p><div className="mt-2 flex gap-2"><button onClick={() => updateAvailabilityStatus(item.id, "Approved")} className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">Approve</button><button onClick={() => updateAvailabilityStatus(item.id, "Denied")} className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">Deny</button></div></SmallCard>)}</div></AppCard><AppCard title="Pending Request Off"><div className="space-y-2">{requestOffs.filter((i) => i.status === "Pending Manager Approval").map((item) => <SmallCard key={item.id}><p className="font-bold">{item.employee}</p><p className="text-sm">{item.date} · {item.shift}</p><div className="mt-2 flex gap-2"><button onClick={() => updateRequestOffStatus(item.id, "Approved")} className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">Approve</button><button onClick={() => updateRequestOffStatus(item.id, "Denied")} className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">Deny</button></div></SmallCard>)}</div></AppCard><AppCard title="Missed Sidework"><div className="space-y-2">{missedNeedingReview.length ? missedNeedingReview.map((entry) => <SmallCard key={entry.id}><p className="font-bold">{entry.task}</p><p className="text-sm text-stone-500">{entry.employee} · {entry.note}</p><button onClick={() => markMissedReviewed(entry.id)} className="mt-2 rounded-full bg-stone-900 px-3 py-1 text-xs font-bold text-white">Mark Reviewed</button></SmallCard>) : <EmptyState text="No missed sidework needing review." />}</div></AppCard></div>
        ) : null}

        {activeView === "staff" && canManageStaff ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_2fr]"><AppCard title="Add Staff"><form onSubmit={addStaffMember} className="space-y-3"><input value={staffForm.name} onChange={(e) => setStaffForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Name" className="w-full rounded-2xl border px-3 py-2" /><select value={staffForm.role} onChange={(e) => setStaffForm((prev) => ({ ...prev, role: e.target.value as Role }))} className="w-full rounded-2xl border px-3 py-2">{ROLES.map((role) => <option key={role}>{role}</option>)}</select><input value={staffForm.pin} onChange={(e) => setStaffForm((prev) => ({ ...prev, pin: digitsOnly(e.target.value).slice(0, 4) }))} placeholder="4-digit PIN" className="w-full rounded-2xl border px-3 py-2" /><button className="w-full rounded-2xl bg-stone-950 px-4 py-2 text-white">Add Staff</button></form></AppCard><AppCard title="Staff List"><div className="space-y-2">{staffState.map((member) => <SmallCard key={member.id}><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold">{member.name}</p><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${getRoleBadgeClass(member.role)}`}>{member.role}</span><p className="mt-1 text-xs text-stone-500">PIN: {member.pin} · {member.active ? "Active" : "Inactive"}</p></div><select value={member.role} onChange={(e) => updateStaffRole(member.id, e.target.value as Role)} className="rounded-2xl border px-3 py-2 text-sm">{ROLES.map((role) => <option key={role}>{role}</option>)}</select></div><div className="mt-3 grid gap-2 sm:grid-cols-2">
  {([
    ["schedule", "Schedule"],
    ["sidework", "Sidework"],
    ["approvals", "Approvals"],
    ["staff", "Staff Admin"],
    ["cloudSync", "Cloud Sync"],
  ] as Array<[keyof StaffPermissions, string]>).map(([permissionKey, label]) => {
    const permissions = getStaffPermissions(member);
    const isEnabled = permissions[permissionKey];
    return (
      <button
        key={permissionKey}
        type="button"
        onClick={() => toggleStaffPermission(member.id, permissionKey)}
        className={`rounded-2xl px-3 py-2 text-xs font-bold ring-1 ${
          isEnabled
            ? "bg-green-100 text-green-800 ring-green-200"
            : "bg-stone-100 text-stone-500 ring-stone-200"
        }`}
      >
        {label}: {isEnabled ? "On" : "Off"}
      </button>
    );
  })}
</div>
<p className="mt-2 text-xs text-stone-400">Permissions are per person, so one Lead can have schedule access without giving all Leads access.</p>
<div className="mt-2 flex gap-2"><button onClick={() => toggleStaffActive(member.id)} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-stone-900">{member.active ? "Deactivate" : "Activate"}</button><button onClick={() => removeStaffMember(member.id)} className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-600">Remove</button></div></SmallCard>)}</div></AppCard></div>
        ) : null}
      </div>
    </div>
  );
}
