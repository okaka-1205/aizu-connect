import { Timestamp } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { getFirebaseErrorMessage } from "../../../lib/appLogic";
import { auth } from "../../../lib/firebase";
import {
  loadAdminAssignment,
  saveAdminAssignment,
} from "../../../repositories/engagementRepository";
import type { AdminAssignment } from "../../../types/domain";

const dateInputValue = (value?: Timestamp) => {
  if (!value) return "";
  const date = value.toDate();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export function AssignmentControls({
  targetType,
  targetId,
}: {
  targetType: AdminAssignment["targetType"];
  targetId: string;
}) {
  const [assignment, setAssignment] = useState<AdminAssignment | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState<AdminAssignment["status"]>("open");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const pendingSave = useRef(false);
  const revision = useRef(0);

  useEffect(() => {
    const current = ++revision.current;
    setIsLoading(true);
    setLoadError("");
    setSaveError("");
    setSaved(false);
    setIsSaving(false);
    pendingSave.current = false;
    void loadAdminAssignment(targetType, targetId)
      .then((value) => {
        if (revision.current !== current) return;
        setAssignment(value);
        setStatus(value?.status ?? "open");
        setDueDate(dateInputValue(value?.dueAt));
      })
      .catch((error: unknown) => {
        if (revision.current === current) {
          setLoadError(getFirebaseErrorMessage(error));
        }
      })
      .finally(() => {
        if (revision.current === current) setIsLoading(false);
      });
    return () => {
      revision.current += 1;
    };
  }, [targetType, targetId, reloadKey]);

  const save = async () => {
    if (isLoading || loadError || pendingSave.current) return;
    const user = auth.currentUser;
    if (!user) {
      setSaveError("ログイン状態を確認してください。");
      return;
    }
    pendingSave.current = true;
    setIsSaving(true);
    setSaveError("");
    setSaved(false);
    const current = revision.current;
    const value: AdminAssignment = {
      targetType,
      targetId,
      assigneeId: user.uid,
      assigneeName: user.email ?? "管理者",
      status,
      dueAt: dueDate
        ? Timestamp.fromDate(new Date(`${dueDate}T23:59:59`))
        : undefined,
    };
    try {
      await saveAdminAssignment(value);
      if (revision.current !== current) return;
      setAssignment(value);
      setSaved(true);
    } catch (error) {
      if (revision.current === current)
        setSaveError(getFirebaseErrorMessage(error));
    } finally {
      if (revision.current === current) {
        pendingSave.current = false;
        setIsSaving(false);
      }
    }
  };

  const disabled = isLoading || isSaving || Boolean(loadError);
  return (
    <div
      className="admin-assignment-controls"
      aria-busy={isLoading || isSaving}
    >
      <select
        aria-label="対応状況"
        value={status}
        disabled={disabled}
        onChange={(event) => {
          setStatus(event.target.value as AdminAssignment["status"]);
          setSaved(false);
        }}
      >
        <option value="open">未対応</option>
        <option value="in_progress">対応中</option>
        <option value="completed">完了</option>
      </select>
      <input
        type="date"
        aria-label="対応期限"
        value={dueDate}
        disabled={disabled}
        onChange={(event) => {
          setDueDate(event.target.value);
          setSaved(false);
        }}
      />
      <button type="button" disabled={disabled} onClick={() => void save()}>
        {isSaving
          ? "保存中…"
          : assignment?.assigneeId === auth.currentUser?.uid
            ? "担当内容を保存"
            : "自分が担当"}
      </button>
      {isLoading && <small>担当情報を読み込み中…</small>}
      {!isLoading && !loadError && assignment && (
        <small>担当：{assignment.assigneeName}</small>
      )}
      {saved && <small role="status">担当情報を保存しました。</small>}
      {(loadError || saveError) && (
        <small className="inline-error" role="alert">
          {loadError || saveError}
        </small>
      )}
      {loadError && (
        <button
          type="button"
          onClick={() => setReloadKey((current) => current + 1)}
        >
          担当情報を再読み込み
        </button>
      )}
    </div>
  );
}
