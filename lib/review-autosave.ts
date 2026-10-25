export type ReviewForm = {
  doneText: string;
  problemText: string;
  tomorrowText: string;
  mood: number;
  summary: string;
};

export type ReviewDraft = {
  date: string;
  form: ReviewForm;
  editedAt: string;
  baseUpdatedAt: string | null;
};

export type ReviewSaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export type ReviewSaveSnapshot = {
  form: ReviewForm;
  savedForm: ReviewForm;
  status: ReviewSaveStatus;
  conflict: boolean;
  hasPending: boolean;
  hasSaved: boolean;
  error: string | null;
  draftError: string | null;
};

type Options = {
  date: string;
  server: { form: ReviewForm; updatedAt: string } | null;
  draft: ReviewDraft | null;
  save: (form: ReviewForm) => Promise<{ updatedAt: string }>;
  writeDraft: (draft: ReviewDraft) => void;
  removeDraft: (form: ReviewForm) => void;
  now?: () => string;
};

export const EMPTY_REVIEW: ReviewForm = {
  doneText: "", problemText: "", tomorrowText: "", mood: 0, summary: "",
};

export function sameReview(left: ReviewForm, right: ReviewForm) {
  return left.doneText === right.doneText && left.problemText === right.problemText &&
    left.tomorrowText === right.tomorrowText && left.mood === right.mood && left.summary === right.summary;
}

export function parseReviewDraft(raw: string | null, date: string): ReviewDraft | null {
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw);
    const form = draft?.form;
    const textFields = ["doneText", "problemText", "tomorrowText", "summary"];
    if (draft?.date !== date || !form || textFields.some((key) => typeof form[key] !== "string")) return null;
    if (!Number.isInteger(form.mood) || form.mood < 0 || form.mood > 5) return null;
    if (typeof draft.editedAt !== "string" || !Number.isFinite(Date.parse(draft.editedAt))) return null;
    if (draft.baseUpdatedAt !== null && typeof draft.baseUpdatedAt !== "string") return null;
    return draft as ReviewDraft;
  } catch {
    return null;
  }
}

// 保存队列只允许一个请求在途；后续编辑合并为最新快照，草稿先于网络请求落地。
export function createReviewAutosave(options: Options) {
  const listeners = new Set<() => void>();
  const savedForm = options.server?.form ?? { ...EMPTY_REVIEW };
  const draft = options.draft;
  const differs = !!draft && !sameReview(draft.form, savedForm);
  let baseUpdatedAt = options.server?.updatedAt ?? null;
  let pending = differs ? { ...draft.form } : null;
  let running: Promise<void> | null = null;
  let state: ReviewSaveSnapshot = {
    form: pending ?? savedForm,
    savedForm,
    status: pending ? "pending" : options.server ? "saved" : "idle",
    conflict: differs && draft.baseUpdatedAt !== baseUpdatedAt,
    hasPending: differs,
    hasSaved: !!options.server,
    error: null,
    draftError: null,
  };

  function publish(patch: Partial<ReviewSaveSnapshot>) {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  }

  function persist(form: ReviewForm) {
    try {
      options.writeDraft({ date: options.date, form, baseUpdatedAt, editedAt: options.now?.() ?? new Date().toISOString() });
      return null;
    } catch {
      return "本机草稿写入失败，请确认内容已保存后再离开。";
    }
  }

  function clearDraft(form: ReviewForm) {
    try {
      options.removeDraft(form);
      return null;
    } catch {
      return "内容已保存，但本机草稿清理失败，下次进入时请核对内容。";
    }
  }

  async function drain() {
    while (pending && !state.conflict) {
      const value = pending;
      pending = null;
      publish({ status: "saving", hasPending: true, error: null });
      try {
        const saved = await options.save(value);
        baseUpdatedAt = saved.updatedAt;
        if (pending) {
          publish({ savedForm: value, hasSaved: true, draftError: persist(pending) });
        } else {
          publish({ savedForm: value, status: "saved", hasPending: false, hasSaved: true, draftError: clearDraft(value) });
        }
      } catch {
        pending ??= value;
        publish({ status: "error", hasPending: true, error: "保存失败，输入仍保留在当前页面，请重新保存。" });
        return;
      }
    }
  }

  function flush() {
    if (running) return running;
    if (!pending || state.conflict) return Promise.resolve();
    running = drain().finally(() => { running = null; });
    return running;
  }

  return {
    snapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    edit(form: ReviewForm) {
      if (state.conflict) return;
      pending = { ...form };
      publish({ form: pending, status: "pending", hasPending: true, error: null, draftError: persist(pending) });
    },
    flush,
    resolveConflict(choice: "draft" | "server") {
      if (!state.conflict) return;
      if (choice === "server") {
        const draftError = clearDraft(state.form);
        pending = null;
        publish({ form: state.savedForm, conflict: false, hasPending: false, status: state.hasSaved ? "saved" : "idle", draftError });
      } else {
        pending = { ...state.form };
        publish({ conflict: false, status: "pending", draftError: persist(pending) });
      }
    },
  };
}

export type ReviewAutosave = ReturnType<typeof createReviewAutosave>;
