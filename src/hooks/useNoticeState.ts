import { useCallback, useState } from "react";
import type { NoticeTone, SetNotice } from "../types/domain";

export function useNoticeState(): [string, NoticeTone, SetNotice] {
  const [notice, setNoticeState] = useState<{
    message: string;
    tone: NoticeTone;
  }>({ message: "", tone: "info" });
  const setNotice = useCallback<SetNotice>((message, tone = "info") => {
    setNoticeState({ message, tone });
  }, []);
  return [notice.message, notice.tone, setNotice];
}
