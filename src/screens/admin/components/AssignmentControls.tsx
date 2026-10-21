import { Timestamp } from "firebase/firestore";
import { useState } from "react";
import { auth } from "../../../lib/firebase";
import { saveAdminAssignment } from "../../../repositories/engagementRepository";

export function AssignmentControls({
  targetType,
  targetId,
}: {
  targetType: "event" | "user" | "report" | "deletion";
  targetId: string;
}) {
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState<"open" | "in_progress" | "done">("open");
  const [saved, setSaved] = useState(false);

  return (
    <div className="admin-assignment-controls">
      <select
        aria-label="対応状況"
        value={status}
        onChange={(event) =>
          setStatus(event.target.value as "open" | "in_progress" | "done")
        }
      >
        <option value="open">未対応</option>
        <option value="in_progress">対応中</option>
        <option value="done">完了</option>
      </select>
      <input
        type="date"
        aria-label="対応期限"
        value={dueDate}
        onChange={(event) => setDueDate(event.target.value)}
      />
      <button
        type="button"
        onClick={() => {
          const user = auth.currentUser;
          if (!user) return;
          void saveAdminAssignment({
            targetType,
            targetId,
            assigneeId: user.uid,
            assigneeName: user.email ?? "管理者",
            status,
            dueAt: dueDate
              ? Timestamp.fromDate(new Date(`${dueDate}T23:59:59`))
              : undefined,
          }).then(() => setSaved(true));
        }}
      >
        {saved ? "担当済み" : "自分が担当"}
      </button>
    </div>
  );
}
