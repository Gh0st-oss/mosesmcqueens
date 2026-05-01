import React, { useEffect, useMemo, useRef, useState } from "react";

type Role =
  | "General Manager"
  | "Manager"
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

type WeekKey = "current" | "next";

type StaffMember = {
  id: number;
  name: string;
  role: Role;
  pin: string;
  active: boolean;
};

type ShiftTemplate = {
  id: number;
  name: string;
  time: string;
};

type ShiftRow = {
  id: number;
  day: string;
  dateLabel: string;
  shift: string;
  time: string;
  employee: string;
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
  "Bartender",
  "Bar Back",
  "Back of House",
];

const STAFF_SEED: StaffMember[] = [
  { id: 1, name: "Jay", role: "Bartender", pin: "1234", active: true },
  { id: 2, name: "Dawn", role: "Bartender", pin: "4321", active: true },
  { id: 3, name: "Chris", role: "Manager", pin: "5678", active: true },
];

const DEFAULT_SHIFT_TEMPLATES: ShiftTemplate[] = [
  { id: 1, name: "Open", time: "9:00 AM - 5:00 PM" },
  { id: 2, name: "Mid", time: "12:00 PM - 8:00 PM" },
  { id: 3, name: "Close", time: "5:00 PM - 1:00 AM" },
];

const WEEK_DATE_MAP: Record<WeekKey, CalendarDate[]> = {
  current: [
    { day: "Monday", dateLabel: "Apr 13" },
    { day: "Tuesday", dateLabel: "Apr 14" },
    { day: "Wednesday", dateLabel: "Apr 15" },
    { day: "Thursday", dateLabel: "Apr 16" },
    { day: "Friday", dateLabel: "Apr 17" },
    { day: "Saturday", dateLabel: "Apr 18" },
    { day: "Sunday", dateLabel: "Apr 19" },
  ],
  next: [
    { day: "Monday", dateLabel: "Apr 20" },
    { day: "Tuesday", dateLabel: "Apr 21" },
    { day: "Wednesday", dateLabel: "Apr 22" },
    { day: "Thursday", dateLabel: "Apr 23" },
    { day: "Friday", dateLabel: "Apr 24" },
    { day: "Saturday", dateLabel: "Apr 25" },
    { day: "Sunday", dateLabel: "Apr 26" },
  ],
};

const SHIFT_SEED: ShiftRow[] = [
  {
    id: 101,
    day: "Monday",
    dateLabel: "Apr 13",
    shift: "Open",
    time: "9:00 AM - 5:00 PM",
    employee: "Jay",
  },
  {
    id: 102,
    day: "Tuesday",
    dateLabel: "Apr 14",
    shift: "Close",
    time: "5:00 PM - 1:00 AM",
    employee: "Dawn",
  },
  {
    id: 103,
    day: "Friday",
    dateLabel: "Apr 17",
    shift: "Mid",
    time: "12:00 PM - 8:00 PM",
    employee: "Chris",
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
const SIDEWORK_ASSIGN_OPTIONS = [
  "Bartender",
  "Bar Back",
  "Back of House",
  "Manager",
  "General Manager",
];
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
  Open: ["Bartender", "Manager", "General Manager"],
  Mid: ["Bartender", "Bar Back", "Manager"],
  Close: ["Bartender", "Bar Back", "Manager"],
};

const REQUEST_OFF_SEED: RequestOff[] = [
  {
    id: 301,
    employee: "Jay",
    date: "Apr 18",
    shift: "All Day",
    note: "Family event",
    status: "Pending Manager Approval",
  },
  {
    id: 302,
    employee: "Chris",
    date: "Apr 21",
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
    <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
      {title ? <h2 className="mb-4 text-lg font-semibold text-stone-900">{title}</h2> : null}
      {children}
    </div>
  );
}

function SmallCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-stone-200 bg-stone-50 p-3 ${className}`}>
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

function TabButton({ label, active, onClick }: { label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
        active ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200"
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
  const [shiftTemplates] = useState<ShiftTemplate[]>(DEFAULT_SHIFT_TEMPLATES);
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
  const [hasLoadedCloud, setHasLoadedCloud] = useState(false);
  const autoPushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoPullTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isApplyingCloudPullRef = useRef(false);

  const [scheduleForm, setScheduleForm] = useState({
    id: null as number | null,
    dateLabel: WEEK_DATE_MAP.current[0].dateLabel,
    shift: DEFAULT_SHIFT_TEMPLATES[0].name,
    employee: STAFF_SEED[0].name,
  });
  const [sideworkForm, setSideworkForm] = useState({
    id: null as number | null,
    role: "Bartender" as Role,
    task: "",
    team: "Open Team",
    assignedTo: "Bartender",
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
  const [missedTaskDraft, setMissedTaskDraft] = useState<MissedTaskDraft>({ itemId: null, note: "" });

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
        if (!isAutoRefresh) setCloudBusy(false);
      }
    }

    void loadCloudData();
  }, [cloudConfig.mode, cloudConfig.projectUrl, cloudConfig.anonKey, cloudConfig.workspaceId]);

  useEffect(() => {
    async function persistCloudData() {
      if (cloudConfig.mode !== "cloud") return;
      if (!cloudConfig.projectUrl.trim() || !cloudConfig.anonKey.trim()) return;
      if (!hasLoadedCloud) return;

      try {
        setCloudStatus("Syncing cloud save...");
        await syncAllCloudData({
        cloudConfig,
          workspaceId: cloudConfig.workspaceId.trim() || DEFAULT_CLOUD_CONFIG.workspaceId,
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
        setCloudStatus("Cloud sync complete");
      } catch {
        setCloudStatus("Cloud sync failed — local save still active");
      }
    }

    void persistCloudData();
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
    if (cloudConfig.mode !== "cloud") return;
    if (!cloudConfig.projectUrl.trim() || !cloudConfig.anonKey.trim()) return;
    if (!hasLoadedCloud) return;
    if (isApplyingCloudPullRef.current) return;

    if (autoPushTimerRef.current) {
      clearTimeout(autoPushTimerRef.current);
    }

    autoPushTimerRef.current = setTimeout(() => {
      void pushCloudDataNow();
    }, 1500);

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

    if (cloudConfig.mode !== "cloud") return;
    if (!cloudConfig.projectUrl.trim() || !cloudConfig.anonKey.trim()) return;

    autoPullTimerRef.current = setInterval(() => {
      void refreshCloudDataNow(true);
    }, 7000);

    return () => {
      if (autoPullTimerRef.current) {
        clearInterval(autoPullTimerRef.current);
        autoPullTimerRef.current = null;
      }
    };
  }, [cloudConfig.mode, cloudConfig.projectUrl, cloudConfig.anonKey, cloudConfig.workspaceId]);

  const allScheduleDates = useMemo(() => [...WEEK_DATE_MAP.current, ...WEEK_DATE_MAP.next], []);
  const visibleScheduleDays = useMemo(() => WEEK_DATE_MAP[calendarWeek], [calendarWeek]);

  const userRole = currentUser?.role;
  const isLeadership = userRole === "General Manager" || userRole === "Manager";
  const canManageSchedule = Boolean(currentUser && isLeadership);
  const canManageSidework = Boolean(currentUser && isLeadership);
  const canManageApprovals = Boolean(currentUser && isLeadership);
  const canManageStaff = Boolean(currentUser && isLeadership);

  const visibleScheduleSource = currentUser && !isLeadership ? publishedSchedule : scheduleState;

  const todayDetectedShift = useMemo(() => {
    if (!currentUser || isLeadership) return null;
    const todayLabel = "Apr 18";
    const todayShift = publishedSchedule.find(
      (shift) => shift.employee === currentUser.name && shift.dateLabel === todayLabel
    );
    return todayShift?.shift || null;
  }, [currentUser, isLeadership, publishedSchedule]);

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
    return [...publishedSchedule]
      .filter((shift) => shift.employee === currentUser.name)
      .sort((a, b) => {
        const aIndex = order.indexOf(`${a.day}-${a.dateLabel}`);
        const bIndex = order.indexOf(`${b.day}-${b.dateLabel}`);
        if (aIndex !== bIndex) return aIndex - bIndex;
        return a.shift.localeCompare(b.shift);
      });
  }, [currentUser, isLeadership, publishedSchedule, allScheduleDates]);

  const myNextShift = myPublishedShifts[0] || null;
  const myFollowingShift = myPublishedShifts[1] || null;

  const myPublishedThisWeek = useMemo(
    () =>
      currentUser && !isLeadership
        ? publishedSchedule.filter(
            (shift) =>
              shift.employee === currentUser.name &&
              visibleScheduleDays.some((day) => day.day === shift.day && day.dateLabel === shift.dateLabel)
          )
        : [],
    [currentUser, isLeadership, publishedSchedule, visibleScheduleDays]
  );

  const publishedThisWeek = useMemo(
    () =>
      publishedSchedule.filter((row) =>
        visibleScheduleDays.some((day) => day.day === row.day && day.dateLabel === row.dateLabel)
      ),
    [publishedSchedule, visibleScheduleDays]
  );

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
      shift: shiftTemplates[0]?.name || "Open",
      employee: staffState.find((member) => member.active)?.name || "Jay",
    });
  }

  function resetSideworkForm() {
    setSideworkForm({
      id: null,
      role: "Bartender",
      task: "",
      team: "Open Team",
      assignedTo: "Bartender",
      shiftWindow: "Open",
      active: true,
    });
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
      window.alert(availabilityIssue);
      return;
    }

    const requestOffIssue = getRequestOffIssue(
      scheduleForm.employee,
      selectedDate.dateLabel,
      scheduleForm.shift,
      requestOffs
    );
    if (requestOffIssue) {
      window.alert(requestOffIssue);
      return;
    }

    const alreadyHasShift = scheduleState.some(
      (row) =>
        row.id !== scheduleForm.id &&
        row.employee === scheduleForm.employee &&
        row.dateLabel === selectedDate.dateLabel
    );
    if (alreadyHasShift) {
      window.alert(`${scheduleForm.employee} is already scheduled on ${selectedDate.dateLabel}.`);
      return;
    }

    const selectedTemplate = shiftTemplates.find((t) => t.name === scheduleForm.shift);
    const nextRow: ShiftRow = {
      id: scheduleForm.id ?? Date.now(),
      day: selectedDate.day,
      dateLabel: selectedDate.dateLabel,
      shift: scheduleForm.shift,
      time: selectedTemplate?.time || scheduleForm.shift,
      employee: scheduleForm.employee,
    };

    if (scheduleForm.id) {
      setScheduleState((prev) => prev.map((row) => (row.id === scheduleForm.id ? nextRow : row)));
    } else {
      setScheduleState((prev) => [...prev, nextRow]);
    }

    resetScheduleForm(selectedDate.dateLabel);
  }

  function startEditShift(row: ShiftRow) {
    if (!canManageSchedule) return;
    setScheduleForm({ id: row.id, dateLabel: row.dateLabel, shift: row.shift, employee: row.employee });
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
                  assignedTo: sideworkForm.assignedTo,
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
              assignedTo: sideworkForm.assignedTo,
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
      assignedTo: item.assignedTo,
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
    setStaffState((prev) => [...prev, { id: Date.now(), name: cleanName, role: staffForm.role, pin: cleanPin, active: true }]);
    setStaffForm({ name: "", role: "Bartender", pin: "" });
  }

  function updateStaffRole(id: number, role: Role) {
    if (!canManageStaff) return;
    setStaffState((prev) => prev.map((member) => (member.id === id ? { ...member, role } : member)));
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
      setCloudStatus(isAutoRefresh ? "Auto-sync checked for updates" : "Cloud data refreshed");
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
    <div className="min-h-screen bg-stone-100 p-6 text-stone-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">MosesMcQueens Ops</h1>
            <p className="text-sm text-stone-500">Stable restore point build.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">
                {cloudConfig.mode === "cloud" ? "Cloud Save On" : "Local Save On"}
              </span>
              <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">
                Pending approvals: {pendingApprovalCount}
              </span>
              <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">
                Active staff: {activeStaffCount}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
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
                <span className="ml-1 text-sm text-stone-500">{currentUser.name} ({currentUser.role})</span>
                <button type="button" onClick={handleLogout} className="rounded-2xl bg-stone-200 px-4 py-2 text-sm text-stone-800">Logout</button>
              </>
            ) : (
              <button type="button" onClick={() => setShowLogin(true)} className="rounded-2xl bg-stone-900 px-4 py-2 text-sm text-white">Login</button>
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
            <AppCard title="Team Snapshot">
              <div className="space-y-3">
                <SmallCard><p className="text-sm text-stone-500">Active staff</p><p className="text-2xl font-semibold">{activeStaffCount}</p></SmallCard>
                <SmallCard><p className="text-sm text-stone-500">Draft shifts</p><p className="text-2xl font-semibold">{totalScheduleCount}</p></SmallCard>
                <SmallCard><p className="text-sm text-stone-500">Visible week shifts</p><p className="text-2xl font-semibold">{shiftsThisWeek.length}</p></SmallCard>
                <SmallCard><p className="text-sm text-stone-500">Published this week</p><p className="text-2xl font-semibold">{publishedThisWeek.length}</p></SmallCard>
                <SmallCard><p className="text-sm text-stone-500">Total sidework tasks</p><p className="text-2xl font-semibold">{sideworkCount}</p></SmallCard>
                <SmallCard><p className="text-sm text-stone-500">Approved availability rules</p><p className="text-2xl font-semibold">{approvedAvailabilityCount}</p></SmallCard>
                <SmallCard><p className="text-sm text-stone-500">Approved request-offs</p><p className="text-2xl font-semibold">{approvedRequestOffCount}</p></SmallCard>
                <SmallCard><p className="text-sm text-stone-500">Pending approvals</p><p className="text-2xl font-semibold">{pendingApprovalCount}</p></SmallCard>
                <SmallCard><p className="text-sm text-stone-500">Schedule conflicts</p><p className="text-2xl font-semibold">{scheduleConflictCount}</p></SmallCard>
              </div>
            </AppCard>

            <AppCard title="Upcoming Schedule">
              {sortedSchedule.length ? (
                <div className="space-y-2">
                  {sortedSchedule.slice(0, 5).map((shift) => (
                    <SmallCard key={shift.id}>
                      <p className="font-medium">{shift.shift} — {shift.employee}</p>
                      <p className="text-sm text-stone-500">{shift.day}, {shift.dateLabel}</p>
                      <p className="text-xs text-stone-400">{shift.time}</p>
                    </SmallCard>
                  ))}
                </div>
              ) : <EmptyState text="No scheduled shifts yet." />}
            </AppCard>

            <AppCard title="Published Schedule Status">
              <div className="space-y-3">
                <SmallCard><p className="text-sm text-stone-500">Last published</p><p className="text-sm font-medium">{publishMeta.lastPublishedAt || "Not published yet"}</p></SmallCard>
                <SmallCard><p className="text-sm text-stone-500">Staff visibility</p><p className="text-sm font-medium">Staff see the published schedule only.</p></SmallCard>
                <SmallCard>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-stone-500">Save mode</p>
                      <p className="text-sm font-medium">{cloudConfig.mode === "cloud" ? "Cloud sync mode" : "Local-only mode"}</p>
                      <p className="mt-1 text-xs text-stone-500">{cloudStatus}{cloudBusy ? "..." : ""}</p>
                      <p className="mt-1 text-[11px] text-stone-400">Auto-sync checks every 7 seconds. Manual buttons stay as backup.</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${cloudConfig.mode === "cloud" ? "bg-emerald-100 text-emerald-700" : "bg-stone-200 text-stone-700"}`}>
                      {cloudConfig.mode === "cloud" ? "Cloud" : "Local"}
                    </span>
                  </div>
                </SmallCard>
              </div>
            </AppCard>

            <AppCard title="Cloud Save Settings">
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={switchToLocalMode}
                    className={`rounded-2xl px-4 py-2 text-sm font-medium ${cloudConfig.mode === "local" ? "bg-stone-900 text-white" : "bg-stone-200 text-stone-800"}`}
                  >
                    Use Local Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setCloudConfig((prev) => ({ ...prev, mode: "cloud" }))}
                    className={`rounded-2xl px-4 py-2 text-sm font-medium ${cloudConfig.mode === "cloud" ? "bg-stone-900 text-white" : "bg-stone-200 text-stone-800"}`}
                  >
                    Use Cloud Save
                  </button>
                </div>

                <input
                  value={cloudConfig.projectUrl}
                  onChange={(e) => setCloudConfig((prev) => ({ ...prev, projectUrl: e.target.value }))}
                  placeholder="Supabase Project URL"
                  className="w-full rounded-2xl border border-stone-300 bg-white px-3 py-2"
                />
                <input
                  value={cloudConfig.anonKey}
                  onChange={(e) => setCloudConfig((prev) => ({ ...prev, anonKey: e.target.value }))}
                  placeholder="Supabase Anon Key"
                  className="w-full rounded-2xl border border-stone-300 bg-white px-3 py-2"
                />
                <input
                  value={cloudConfig.workspaceId}
                  onChange={(e) => setCloudConfig((prev) => ({ ...prev, workspaceId: e.target.value }))}
                  placeholder="Workspace ID"
                  className="w-full rounded-2xl border border-stone-300 bg-white px-3 py-2"
                />

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="relative z-50">
                  <button
                    onClick={() => {
                      saveCloudSettingsNow();
                    }}
                    className="rounded-2xl bg-green-600 px-4 py-2 text-sm font-medium text-white"
                  >
                    Save Cloud Settings
                  </button>
                </div>
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">
                    Current mode: {cloudConfig.mode === "cloud" ? "Cloud" : "Local"}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    onClick={() => {
                      void pushCloudDataNow();
                    }}
                    disabled={cloudBusy || cloudConfig.mode !== "cloud"}
                    className={`w-full rounded-2xl px-4 py-2 text-sm font-medium text-white ${cloudBusy || cloudConfig.mode !== "cloud" ? "cursor-not-allowed bg-stone-300" : "bg-emerald-600"}`}
                  >
                    {cloudBusy ? "Working..." : "Push Cloud Data"}
                  </button>

                  <button
                    onClick={() => {
                      void refreshCloudDataNow();
                    }}
                    disabled={cloudBusy || cloudConfig.mode !== "cloud"}
                    className={`w-full rounded-2xl px-4 py-2 text-sm font-medium text-white ${cloudBusy || cloudConfig.mode !== "cloud" ? "cursor-not-allowed bg-stone-300" : "bg-blue-600"}`}
                  >
                    {cloudBusy ? "Working..." : "Refresh Cloud Data"}
                  </button>
                </div>

                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3 text-xs text-stone-500">
                  Create one row per workspace in each Supabase table using <span className="font-semibold">workspace_id</span>, <span className="font-semibold">payload</span> (jsonb), and <span className="font-semibold">updated_at</span> (timestamp). Set <span className="font-semibold">workspace_id</span> as unique for upsert.
                </div>
              </div>
            </AppCard>

            {currentUser && !isLeadership ? (
              <AppCard title="My Shift Snapshot">
                <div className="space-y-3">
                  <SmallCard>
                    <p className="text-sm text-stone-500">Next shift</p>
                    {myNextShift ? (
                      <>
                        <p className="font-medium">{myNextShift.shift} — {myNextShift.dateLabel}</p>
                        <p className="text-sm text-stone-500">{myNextShift.time}</p>
                      </>
                    ) : (
                      <p className="text-sm text-stone-400">No shift scheduled</p>
                    )}
                  </SmallCard>
                  <SmallCard>
                    <p className="text-sm text-stone-500">Following shift</p>
                    {myFollowingShift ? (
                      <>
                        <p className="font-medium">{myFollowingShift.shift} — {myFollowingShift.dateLabel}</p>
                        <p className="text-sm text-stone-500">{myFollowingShift.time}</p>
                      </>
                    ) : (
                      <p className="text-sm text-stone-400">No additional shift scheduled</p>
                    )}
                  </SmallCard>
                  {!activeShift ? (
                    <button
                      type="button"
                      onClick={() => setShowShiftSelector(true)}
                      className="w-full rounded-2xl bg-stone-900 px-4 py-2 text-sm text-white"
                    >
                      Start Shift
                    </button>
                  ) : (
                    <SmallCard>
                      <p className="text-sm text-stone-500">Active Shift</p>
                      <p className="font-semibold">{activeShift}</p>
                      {todayDetectedShift ? (
                        <p className="mt-1 text-xs text-stone-500">Auto-detected from today&apos;s published schedule</p>
                      ) : (
                        <p className="mt-1 text-xs text-stone-500">Manually selected</p>
                      )}
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => setShowShiftSelector(true)}
                          className="rounded-xl bg-stone-200 px-3 py-1 text-xs text-stone-800"
                        >
                          Change Shift
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveShift(null);
                            setSideworkFilter("All");
                          }}
                          className="rounded-xl bg-red-50 px-3 py-1 text-xs text-red-600"
                        >
                          End Shift
                        </button>
                      </div>
                    </SmallCard>
                  )}
                </div>
              </AppCard>
            ) : null}
          </div>
        ) : null}

        {activeView === "schedule" ? (
          currentUser ? (
            canManageSchedule ? (
              <div className="space-y-6">
                <AppCard title="Add / Edit Shift">
                  <form onSubmit={addOrEditScheduleShift} className="grid gap-3 md:grid-cols-4">
                    <select value={scheduleForm.dateLabel} onChange={(e) => setScheduleForm((prev) => ({ ...prev, dateLabel: e.target.value }))} className="rounded-2xl border border-stone-300 bg-white px-3 py-2">
                      {allScheduleDates.map((date) => <option key={date.dateLabel} value={date.dateLabel}>{date.day} - {date.dateLabel}</option>)}
                    </select>
                    <select value={scheduleForm.shift} onChange={(e) => setScheduleForm((prev) => ({ ...prev, shift: e.target.value }))} className="rounded-2xl border border-stone-300 bg-white px-3 py-2">
                      {shiftTemplates.map((template) => <option key={template.id} value={template.name}>{template.name}</option>)}
                    </select>
                    <select value={scheduleForm.employee} onChange={(e) => setScheduleForm((prev) => ({ ...prev, employee: e.target.value }))} className="rounded-2xl border border-stone-300 bg-white px-3 py-2">
                      {staffState.filter((member) => member.active).map((member) => <option key={member.id} value={member.name}>{member.name}</option>)}
                    </select>
                    <div className="flex gap-2">
                      <button type="submit" className="flex-1 rounded-2xl bg-stone-900 px-4 py-2 text-white">{scheduleForm.id ? "Update" : "Add"}</button>
                      {scheduleForm.id ? <button type="button" onClick={() => resetScheduleForm()} className="rounded-2xl bg-stone-200 px-4 py-2 text-stone-800">Clear</button> : null}
                    </div>
                  </form>
                </AppCard>

                <AppCard title="Weekly Schedule">
                  <div className="mb-4 rounded-2xl border border-stone-200 bg-stone-50 p-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-medium text-stone-800">Draft schedule editor</p>
                        <p className="text-xs text-stone-500">Staff cannot see draft changes until you publish.</p>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                        <p className="text-xs text-stone-500">Last published: {publishMeta.lastPublishedAt || "Never"}</p>
                        <button type="button" onClick={publishSchedule} className="w-full rounded-2xl bg-stone-900 px-4 py-2 text-sm text-white sm:w-auto">Publish Schedule</button>
                      </div>
                    </div>
                  </div>

                  <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <TabButton label="Current Week" active={calendarWeek === "current"} onClick={() => setCalendarWeek("current")} />
                      <TabButton label="Next Week" active={calendarWeek === "next"} onClick={() => setCalendarWeek("next")} />
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button type="button" onClick={copyCurrentToNextWeek} className="w-full rounded-2xl bg-stone-200 px-4 py-2 text-sm text-stone-800 sm:w-auto">Copy Current → Next</button>
                      <button type="button" onClick={autoScheduleVisibleWeek} className="w-full rounded-2xl bg-stone-900 px-4 py-2 text-sm text-white sm:w-auto">Auto-Schedule</button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {visibleScheduleDays.map((day) => {
                      const dayShifts = scheduleState.filter((row) => row.day === day.day && row.dateLabel === day.dateLabel);
                      return (
                        <div key={`${day.day}-${day.dateLabel}`} className="rounded-3xl border border-stone-200 bg-stone-50 p-4 sm:p-5">
                          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-base font-semibold text-stone-900">{day.day}</p>
                              <p className="text-sm text-stone-500">{day.dateLabel}</p>
                            </div>
                            <button type="button" onClick={() => clearDay(day)} className="w-full rounded-2xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600 sm:w-auto">Clear Day</button>
                          </div>

                          {dayShifts.length ? (
                            <div className="space-y-3">
                              {dayShifts.map((shift) => {
                                const alert = scheduleAlerts[shift.id];
                                const hasIssue = Boolean(alert?.availabilityIssue || alert?.requestOffIssue || alert?.doubleBooked);
                                return (
                                  <SmallCard key={shift.id} className={hasIssue ? "border-red-200 bg-red-50" : "bg-white"}>
                                    <div className="space-y-3">
                                      <div>
                                        <p className="text-base font-medium text-stone-900">{shift.shift} — {shift.employee}</p>
                                        <p className="text-sm text-stone-500">{shift.time}</p>
                                      </div>

                                      {alert?.availabilityIssue ? <p className="rounded-xl bg-white/70 px-3 py-2 text-xs text-red-600">⚠ {alert.availabilityIssue}</p> : null}
                                      {alert?.requestOffIssue ? <p className="rounded-xl bg-white/70 px-3 py-2 text-xs text-red-600">⚠ {alert.requestOffIssue}</p> : null}
                                      {alert?.doubleBooked ? <p className="rounded-xl bg-white/70 px-3 py-2 text-xs text-red-600">⚠ Double-booked on this date.</p> : null}

                                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                                        <button type="button" onClick={() => startEditShift(shift)} className="w-full rounded-2xl bg-stone-200 px-3 py-2 text-sm text-stone-800 sm:w-auto">Edit</button>
                                        <button type="button" onClick={() => duplicateShift(shift)} className="w-full rounded-2xl bg-stone-200 px-3 py-2 text-sm text-stone-800 sm:w-auto">+1 Week</button>
                                        <button type="button" onClick={() => removeScheduleShift(shift.id)} className="w-full rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-600 sm:w-auto">Delete</button>
                                      </div>
                                    </div>
                                  </SmallCard>
                                );
                              })}
                            </div>
                          ) : <EmptyState text="No shifts scheduled for this day." />}
                        </div>
                      );
                    })}
                  </div>
                </AppCard>
              </div>
            ) : (
              <AppCard title="Published Schedule">
                <div className="mb-4">
                  <p className="text-sm text-stone-500">You are viewing the published team schedule.</p>
                  <p className="text-xs text-stone-400">Last published: {publishMeta.lastPublishedAt || "Not published yet"}</p>
                </div>

                <div className="mb-4">
                  <h3 className="mb-2 text-sm font-semibold text-stone-800">My Published Shifts This Week</h3>
                  <div className="space-y-2">
                    {myPublishedThisWeek.length ? (
                      myPublishedThisWeek.map((shift) => (
                        <SmallCard key={`mine-${shift.id}`}>
                          <p className="font-medium">{shift.shift} — {shift.dateLabel}</p>
                          <p className="text-sm text-stone-500">{shift.time}</p>
                        </SmallCard>
                      ))
                    ) : (
                      <EmptyState text="No personal published shifts this week." />
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  {visibleScheduleDays.map((day) => {
                    const dayShifts = publishedSchedule.filter((row) => row.day === day.day && row.dateLabel === day.dateLabel);
                    return (
                      <div key={`${day.day}-${day.dateLabel}`} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                        <div className="mb-3"><p className="font-semibold">{day.day}</p><p className="text-sm text-stone-500">{day.dateLabel}</p></div>
                        {dayShifts.length ? (
                          <div className="space-y-2">
                            {dayShifts.map((shift) => (
                              <SmallCard key={shift.id}>
                                <p className="font-medium">{shift.shift} — {shift.employee}</p>
                                <p className="text-sm text-stone-500">{shift.time}</p>
                              </SmallCard>
                            ))}
                          </div>
                        ) : <EmptyState text="No published shifts for this day." />}
                      </div>
                    );
                  })}
                </div>
              </AppCard>
            )
          ) : <AppCard title="Schedule Access"><EmptyState text="Log in to view the schedule." /></AppCard>
        ) : null}

        {activeView === "sidework" ? (
          canManageSidework ? (
            <div className="space-y-6">
              <AppCard title="Manage Sidework">
                <form onSubmit={addOrEditSidework} className="grid gap-3 md:grid-cols-6">
                  <select value={sideworkForm.role} onChange={(e) => setSideworkForm((prev) => ({ ...prev, role: e.target.value as Role }))} className="rounded-2xl border border-stone-300 bg-white px-3 py-2">
                    {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                  </select>
                  <input value={sideworkForm.task} onChange={(e) => setSideworkForm((prev) => ({ ...prev, task: e.target.value }))} placeholder="Task" className="rounded-2xl border border-stone-300 bg-white px-3 py-2" />
                  <select value={sideworkForm.shiftWindow} onChange={(e) => setSideworkForm((prev) => ({ ...prev, shiftWindow: e.target.value }))} className="rounded-2xl border border-stone-300 bg-white px-3 py-2">
                    {SIDEWORK_SHIFT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                  <select value={sideworkForm.assignedTo} onChange={(e) => setSideworkForm((prev) => ({ ...prev, assignedTo: e.target.value }))} className="rounded-2xl border border-stone-300 bg-white px-3 py-2">
                    {SIDEWORK_ASSIGN_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                  <select value={sideworkForm.team} onChange={(e) => setSideworkForm((prev) => ({ ...prev, team: e.target.value }))} className="rounded-2xl border border-stone-300 bg-white px-3 py-2">
                    {TEAM_OPTIONS.map((team) => <option key={team} value={team}>{team}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <button type="submit" className="flex-1 rounded-2xl bg-stone-900 px-4 py-2 text-white">{sideworkForm.id ? "Update" : "Add"}</button>
                    {sideworkForm.id ? <button type="button" onClick={resetSideworkForm} className="rounded-2xl bg-stone-200 px-4 py-2 text-stone-800">Clear</button> : null}
                  </div>
                </form>
              </AppCard>

              <AppCard title="Sidework Oversight & Review">
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-4">
                    <SmallCard><p className="text-sm text-stone-500">Total tasks</p><p className="text-2xl font-semibold">{allSideworkItems.length}</p></SmallCard>
                    <SmallCard><p className="text-sm text-stone-500">Completed</p><p className="text-2xl font-semibold text-green-600">{completedSideworkItems.length}</p></SmallCard>
                    <SmallCard><p className="text-sm text-stone-500">Missed awaiting review</p><p className="text-2xl font-semibold text-red-600">{missedNeedingReview.length}</p></SmallCard>
                    <SmallCard><p className="text-sm text-stone-500">Still pending</p><p className="text-2xl font-semibold text-amber-600">{pendingSideworkItems.length}</p></SmallCard>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-stone-800">Manager Review Queue</h3>
                    {missedNeedingReview.length ? (
                      missedNeedingReview.map((entry) => (
                        <SmallCard key={entry.id} className="border-red-200 bg-red-50">
                          <p className="font-medium">{entry.task}</p>
                          <p className="text-sm text-stone-500">{entry.employee} · {entry.role}</p>
                          <p className="text-xs text-red-600">Missed · {entry.note}</p>
                          <button type="button" onClick={() => markMissedReviewed(entry.id)} className="mt-2 rounded-2xl bg-stone-900 px-3 py-1 text-xs text-white">Review Complete</button>
                        </SmallCard>
                      ))
                    ) : (
                      <EmptyState text="No missed tasks pending review." />
                    )}
                  </div>
                </div>
              </AppCard>

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setShowSideworkHistory((prev) => !prev)} className="rounded-2xl bg-stone-900 px-4 py-2 text-sm text-white">
                  {showSideworkHistory ? "Hide History" : "Show History"}
                </button>
              </div>

              {showSideworkHistory ? (
                <AppCard title="Sidework History">
                  <div className="space-y-3">
                    {sideworkLog.length ? (
                      sideworkLog.slice(0, 20).map((entry) => (
                        <SmallCard key={entry.id}>
                          <p className="font-medium">{entry.task}</p>
                          <p className="text-sm text-stone-500">{entry.employee} · {entry.role}</p>
                          <p className="text-xs text-stone-400">Shift: {entry.shift} · {entry.timestamp}</p>
                          <p className={`text-xs ${entry.completed ? "text-green-700" : "text-red-600"}`}>{entry.completed ? "Completed" : `Missed · ${entry.note}`}</p>
                        </SmallCard>
                      ))
                    ) : (
                      <EmptyState text="No sidework history yet." />
                    )}
                  </div>
                </AppCard>
              ) : null}
            </div>
          ) : currentUser ? (
            <AppCard title="My Sidework Checklist">
              <div className="mb-4 space-y-4">
                <SmallCard className="bg-white">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-stone-800">Overall Progress</p>
                    <p className="text-sm text-stone-500">{mySideworkProgress.completed} / {mySideworkProgress.total} completed</p>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-stone-200">
                    <div className="h-full rounded-full bg-stone-900 transition-all" style={{ width: `${mySideworkProgress.percent}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-stone-500">{mySideworkProgress.percent}% complete</p>
                </SmallCard>

                <div className="grid gap-3 sm:grid-cols-3">
                  {myShiftProgress.map((item) => (
                    <SmallCard key={item.shift} className="bg-white">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-stone-800">{item.shift}</p>
                        <p className="text-xs text-stone-500">{item.completed}/{item.total}</p>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-stone-200">
                        <div className="h-full rounded-full bg-stone-900 transition-all" style={{ width: `${item.percent}%` }} />
                      </div>
                      <p className="mt-2 text-xs text-stone-500">{item.percent}% complete</p>
                    </SmallCard>
                  ))}
                </div>
              </div>

              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <select value={sideworkFilter} onChange={(e) => setSideworkFilter(e.target.value)} className="w-full rounded-2xl border border-stone-300 bg-white px-3 py-2 text-sm sm:w-auto">
                  <option value="All">All</option>
                  <option value="Open">Open</option>
                  <option value="Mid">Mid</option>
                  <option value="Close">Close</option>
                </select>

                <button
                  type="button"
                  onClick={completeAllMySidework}
                  disabled={visibleIncompleteMySideworkCount === 0}
                  className={`w-full rounded-2xl px-4 py-2 text-sm text-white sm:w-auto ${
                    visibleIncompleteMySideworkCount === 0 ? "cursor-not-allowed bg-stone-300" : "bg-stone-900"
                  }`}
                >
                  Complete Visible Tasks
                </button>
              </div>

              <div className="space-y-3">
                {mySideworkItems.length ? (
                  mySideworkItems.map((item) => (
                    <SmallCard key={item.id}>
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-medium">{item.task}</p>
                          <p className="text-sm text-stone-500">{item.team}</p>
                          <p className="text-xs text-stone-400">Shift: {item.shiftWindow} · For: {item.assignedTo}</p>
                          <p className={`text-xs ${sideworkCompletionState[item.id]?.status === "completed" ? "text-green-600" : sideworkCompletionState[item.id]?.status === "missed" ? "text-red-600" : "text-amber-600"}`}>
                            {sideworkCompletionState[item.id]?.status === "completed"
                              ? `Completed by ${sideworkCompletionState[item.id]?.completedBy} at ${sideworkCompletionState[item.id]?.completedAt}`
                              : sideworkCompletionState[item.id]?.status === "missed"
                              ? `Marked missed by ${sideworkCompletionState[item.id]?.completedBy} at ${sideworkCompletionState[item.id]?.completedAt} · ${sideworkCompletionState[item.id]?.note}`
                              : "Pending completion"}
                          </p>
                        </div>

                        <div className="flex flex-col gap-2">
                          <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
                            <input type="checkbox" checked={sideworkCompletionState[item.id]?.status === "completed"} onChange={() => toggleSideworkCompletion(item.id)} />
                            Mark task complete
                          </label>

                          <button type="button" onClick={() => setMissedTaskDraft((prev) => ({ itemId: prev.itemId === item.id ? null : item.id, note: prev.itemId === item.id ? "" : prev.note }))} className="rounded-2xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                            Report missed task
                          </button>

                          {missedTaskDraft.itemId === item.id ? (
                            <div className="space-y-2 rounded-2xl border border-red-200 bg-red-50 p-3">
                              <textarea value={missedTaskDraft.note} onChange={(e) => setMissedTaskDraft({ itemId: item.id, note: e.target.value })} placeholder="Why was this not completed?" className="min-h-[80px] w-full rounded-2xl border border-red-200 bg-white px-3 py-2 text-sm" />
                              <div className="flex gap-2">
                                <button type="button" onClick={() => submitMissedTask(item.id)} className="rounded-2xl bg-stone-900 px-3 py-2 text-xs text-white">Submit missed note</button>
                                <button type="button" onClick={() => setMissedTaskDraft({ itemId: null, note: "" })} className="rounded-2xl bg-stone-200 px-3 py-2 text-xs text-stone-800">Cancel</button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </SmallCard>
                  ))
                ) : (
                  <EmptyState text="No sidework is assigned to your role right now." />
                )}
              </div>
            </AppCard>
          ) : <AppCard title="Sidework Access"><EmptyState text="Log in to view and complete sidework." /></AppCard>
        ) : null}

        {activeView === "availability" ? (
          <div className="space-y-6">
            <AppCard title="Submit Availability Request">
              <form onSubmit={submitAvailability} className="grid gap-3 md:grid-cols-4">
                <select value={availabilityForm.employee} onChange={(e) => setAvailabilityForm((prev) => ({ ...prev, employee: e.target.value }))} className="rounded-2xl border border-stone-300 bg-white px-3 py-2">
                  {staffState.filter((member) => member.active).map((member) => <option key={member.id} value={member.name}>{member.name}</option>)}
                </select>
                <select value={availabilityForm.day} onChange={(e) => setAvailabilityForm((prev) => ({ ...prev, day: e.target.value }))} className="rounded-2xl border border-stone-300 bg-white px-3 py-2">
                  {DAY_OPTIONS.map((day) => <option key={day} value={day}>{day}</option>)}
                </select>
                <select value={availabilityForm.restriction} onChange={(e) => setAvailabilityForm((prev) => ({ ...prev, restriction: e.target.value }))} className="rounded-2xl border border-stone-300 bg-white px-3 py-2">
                  {AVAILABILITY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
                <button type="submit" className="rounded-2xl bg-stone-900 px-4 py-2 text-white">Submit Availability</button>
              </form>
            </AppCard>

            <AppCard title="Availability Requests">
              <div className="space-y-3">
                {availabilityRequests.length ? (
                  availabilityRequests.map((item) => (
                    <SmallCard key={item.id}>
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-medium">{item.employee}</p>
                          <p className="text-sm text-stone-500">{item.day}</p>
                          <p className="text-sm text-stone-700">{item.restriction}</p>
                          <p className={`text-xs ${item.status === "Approved" ? "text-green-600" : item.status === "Denied" ? "text-red-600" : "text-amber-600"}`}>{item.status}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {canManageApprovals ? (
                            <>
                              <button type="button" onClick={() => updateAvailabilityStatus(item.id, "Approved")} className="rounded-2xl bg-stone-200 px-3 py-2 text-xs text-stone-800">Approve</button>
                              <button type="button" onClick={() => updateAvailabilityStatus(item.id, "Denied")} className="rounded-2xl bg-stone-200 px-3 py-2 text-xs text-stone-800">Deny</button>
                              <button type="button" onClick={() => removeAvailabilityRule(item.id)} className="rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-600">Remove</button>
                            </>
                          ) : <span className="text-xs text-stone-400">Leadership review only</span>}
                        </div>
                      </div>
                    </SmallCard>
                  ))
                ) : <EmptyState text="No availability requests yet." />}
              </div>
            </AppCard>
          </div>
        ) : null}

        {activeView === "requestOff" ? (
          <div className="space-y-6">
            <AppCard title="Submit Request Off">
              <form onSubmit={submitRequestOff} className="grid gap-3 md:grid-cols-4">
                <select value={requestOffForm.employee} onChange={(e) => setRequestOffForm((prev) => ({ ...prev, employee: e.target.value }))} className="rounded-2xl border border-stone-300 bg-white px-3 py-2">
                  {staffState.filter((member) => member.active).map((member) => <option key={member.id} value={member.name}>{member.name}</option>)}
                </select>
                <select value={requestOffForm.date} onChange={(e) => setRequestOffForm((prev) => ({ ...prev, date: e.target.value }))} className="rounded-2xl border border-stone-300 bg-white px-3 py-2">
                  {allScheduleDates.map((date) => <option key={date.dateLabel} value={date.dateLabel}>{date.day} - {date.dateLabel}</option>)}
                </select>
                <select value={requestOffForm.shift} onChange={(e) => setRequestOffForm((prev) => ({ ...prev, shift: e.target.value }))} className="rounded-2xl border border-stone-300 bg-white px-3 py-2">
                  {REQUEST_OFF_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
                <input value={requestOffForm.note} onChange={(e) => setRequestOffForm((prev) => ({ ...prev, note: e.target.value }))} placeholder="Reason / note" className="rounded-2xl border border-stone-300 bg-white px-3 py-2" />
                <button type="submit" className="rounded-2xl bg-stone-900 px-4 py-2 text-white md:col-span-4">Submit Request Off</button>
              </form>
            </AppCard>

            <AppCard title="Request Off List">
              <div className="space-y-3">
                {requestOffs.length ? (
                  requestOffs.map((item) => (
                    <SmallCard key={item.id}>
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-medium">{item.employee}</p>
                          <p className="text-sm text-stone-500">{item.date} — {item.shift}</p>
                          <p className="text-sm text-stone-700">{item.note || "No note"}</p>
                          <p className={`text-xs ${item.status === "Approved" ? "text-green-600" : item.status === "Denied" ? "text-red-600" : "text-amber-600"}`}>{item.status}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {canManageApprovals ? (
                            <>
                              <button type="button" onClick={() => updateRequestOffStatus(item.id, "Approved")} className="rounded-2xl bg-stone-200 px-3 py-2 text-xs text-stone-800">Approve</button>
                              <button type="button" onClick={() => updateRequestOffStatus(item.id, "Denied")} className="rounded-2xl bg-stone-200 px-3 py-2 text-xs text-stone-800">Deny</button>
                              <button type="button" onClick={() => removeRequestOff(item.id)} className="rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-600">Remove</button>
                            </>
                          ) : <span className="text-xs text-stone-400">Leadership review only</span>}
                        </div>
                      </div>
                    </SmallCard>
                  ))
                ) : <EmptyState text="No request-offs yet." />}
              </div>
            </AppCard>
          </div>
        ) : null}

        {activeView === "tradeShifts" ? (
          currentUser ? (
            <div className="space-y-6">
              <AppCard title="Request a Shift Trade">
                <form onSubmit={submitTradeRequest} className="grid gap-3 md:grid-cols-5">
                  <select value={tradeForm.employee} onChange={(e) => setTradeForm((prev) => ({ ...prev, employee: e.target.value }))} className="rounded-2xl border border-stone-300 bg-white px-3 py-2">
                    {staffState.filter((member) => member.active).map((member) => <option key={member.id} value={member.name}>{member.name}</option>)}
                  </select>
                  <select value={tradeForm.shiftId} onChange={(e) => setTradeForm((prev) => ({ ...prev, shiftId: e.target.value }))} className="rounded-2xl border border-stone-300 bg-white px-3 py-2">
                    <option value="">Select your shift</option>
                    {scheduleState.filter((shift) => shift.employee === tradeForm.employee).map((shift) => <option key={shift.id} value={String(shift.id)}>{shift.dateLabel} — {shift.shift}</option>)}
                  </select>
                  <select value={tradeForm.tradeWith} onChange={(e) => setTradeForm((prev) => ({ ...prev, tradeWith: e.target.value }))} className="rounded-2xl border border-stone-300 bg-white px-3 py-2">
                    <option value="">Trade with</option>
                    {staffState.filter((member) => member.active && member.name !== tradeForm.employee).map((member) => <option key={member.id} value={member.name}>{member.name}</option>)}
                  </select>
                  <select value={tradeForm.requestedShift} onChange={(e) => setTradeForm((prev) => ({ ...prev, requestedShift: e.target.value }))} className="rounded-2xl border border-stone-300 bg-white px-3 py-2">
                    {REQUEST_OFF_OPTIONS.filter((option) => option !== "All Day").map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                  <input value={tradeForm.note} onChange={(e) => setTradeForm((prev) => ({ ...prev, note: e.target.value }))} placeholder="Reason / note" className="rounded-2xl border border-stone-300 bg-white px-3 py-2" />
                  <button type="submit" className="rounded-2xl bg-stone-900 px-4 py-2 text-white md:col-span-5">Submit Trade Request</button>
                </form>
              </AppCard>

              <AppCard title="Trade Requests">
                <div className="space-y-3">
                  {tradeRequests.length ? (
                    tradeRequests.map((item) => {
                      const sourceShift = scheduleState.find((shift) => shift.id === item.shiftId);
                      return (
                        <SmallCard key={item.id}>
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                              <p className="font-medium">{item.employee} → {item.tradeWith}</p>
                              <p className="text-sm text-stone-500">{sourceShift ? `${sourceShift.dateLabel} — ${sourceShift.shift}` : `Shift #${item.shiftId}`}</p>
                              <p className="text-sm text-stone-700">Requested shift: {item.requestedShift}</p>
                              <p className="text-sm text-stone-700">{item.note || "No note"}</p>
                              <p className={`text-xs ${item.status === "Approved" ? "text-green-600" : item.status === "Denied" ? "text-red-600" : "text-amber-600"}`}>{item.status}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {canManageApprovals ? (
                                <>
                                  <button type="button" onClick={() => updateTradeStatus(item.id, "Approved")} className="rounded-2xl bg-stone-200 px-3 py-2 text-xs text-stone-800">Approve</button>
                                  <button type="button" onClick={() => updateTradeStatus(item.id, "Denied")} className="rounded-2xl bg-stone-200 px-3 py-2 text-xs text-stone-800">Deny</button>
                                  <button type="button" onClick={() => removeTradeRequest(item.id)} className="rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-600">Remove</button>
                                </>
                              ) : <span className="text-xs text-stone-400">Leadership review only</span>}
                            </div>
                          </div>
                        </SmallCard>
                      );
                    })
                  ) : <EmptyState text="No trade requests yet." />}
                </div>
              </AppCard>
            </div>
          ) : <AppCard title="Trade Shift Access"><EmptyState text="Log in to request a trade shift." /></AppCard>
        ) : null}

        {activeView === "approvals" ? (
          canManageApprovals ? (
            <div className="space-y-6">
              <AppCard title="Approvals Overview">
                <div className="grid gap-3 md:grid-cols-3">
                  <SmallCard><p className="text-sm text-stone-500">Pending availability</p><p className="text-2xl font-semibold">{availabilityRequests.filter((item) => item.status === "Pending Manager Approval").length}</p></SmallCard>
                  <SmallCard><p className="text-sm text-stone-500">Pending request-offs</p><p className="text-2xl font-semibold">{requestOffs.filter((item) => item.status === "Pending Manager Approval").length}</p></SmallCard>
                  <SmallCard><p className="text-sm text-stone-500">Pending trade requests</p><p className="text-2xl font-semibold">{tradeRequests.filter((item) => item.status === "Pending Manager Approval").length}</p></SmallCard>
                </div>
              </AppCard>
            </div>
          ) : <AppCard title="Approvals Access"><EmptyState text="Only managers and general managers can review approvals." /></AppCard>
        ) : null}

        {activeView === "staff" ? (
          canManageStaff ? (
            <div className="space-y-6">
              <AppCard title="Add Staff Member">
                <form onSubmit={addStaffMember} className="grid gap-3 md:grid-cols-4">
                  <input value={staffForm.name} onChange={(e) => setStaffForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Name" className="rounded-2xl border border-stone-300 bg-white px-3 py-2" />
                  <select value={staffForm.role} onChange={(e) => setStaffForm((prev) => ({ ...prev, role: e.target.value as Role }))} className="rounded-2xl border border-stone-300 bg-white px-3 py-2">
                    {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                  </select>
                  <input value={staffForm.pin} onChange={(e) => setStaffForm((prev) => ({ ...prev, pin: digitsOnly(e.target.value).slice(0, 4) }))} placeholder="4-digit PIN" className="rounded-2xl border border-stone-300 bg-white px-3 py-2" maxLength={4} />
                  <button type="submit" className="rounded-2xl bg-stone-900 px-4 py-2 text-white">Add Staff</button>
                </form>
              </AppCard>

              <AppCard title="Staff Members">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {staffState.map((member) => (
                    <SmallCard key={member.id}>
                      <div className="space-y-3">
                        <div>
                          <p className="font-medium">{member.name}</p>
                          <p className="text-sm text-stone-500">{member.role}</p>
                          <p className={`text-xs ${member.active ? "text-green-600" : "text-red-600"}`}>{member.active ? "Active" : "Inactive"}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => updateStaffRole(member.id, ROLES[(ROLES.indexOf(member.role) + 1) % ROLES.length])} className="rounded-2xl bg-stone-200 px-3 py-2 text-xs text-stone-800">Change Role</button>
                          <button type="button" onClick={() => toggleStaffActive(member.id)} className="rounded-2xl bg-stone-200 px-3 py-2 text-xs text-stone-800">{member.active ? "Deactivate" : "Activate"}</button>
                          <button type="button" onClick={() => removeStaffMember(member.id)} className="rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-600">Remove</button>
                        </div>
                      </div>
                    </SmallCard>
                  ))}
                </div>
              </AppCard>
            </div>
          ) : <AppCard title="Staff Access"><EmptyState text="Only managers and general managers can manage staff." /></AppCard>
        ) : null}
      </div>
    </div>
  );
}
