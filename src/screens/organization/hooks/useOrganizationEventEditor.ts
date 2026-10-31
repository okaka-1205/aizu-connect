import { collection, doc, Timestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { defaultTakeaways, eventTemplates } from "../../../config/events";
import {
  formatEventStart,
  getFirebaseErrorMessage,
  isFutureEventStart,
  toDateTimeInput,
} from "../../../lib/appLogic";
import {
  preferredScrollBehavior,
  revokeObjectUrl,
} from "../../../lib/eventUtils";
import { db, functions } from "../../../lib/firebase";
import { uploadImage } from "../../../lib/storage";
import type {
  AizuEvent,
  ApplicationQuestion,
  AppUser,
  SetNotice,
} from "../../../types/domain";

export function useOrganizationEventEditor({
  appUser,
  events,
  organizationName,
  loadEvents,
  showOrganizationView,
  setSelectedEventId,
  setNotice,
}: {
  appUser: AppUser;
  events: AizuEvent[];
  organizationName: string;
  loadEvents: () => Promise<void>;
  showOrganizationView: (view: "create" | "events") => void;
  setSelectedEventId: (id: string | null) => void;
  setNotice: SetNotice;
}) {
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [location, setLocation] = useState("会津若松市");
  const [startAtInput, setStartAtInput] = useState("");
  const [endAtInput, setEndAtInput] = useState("");
  const [capacity, setCapacity] = useState(20);
  const [category, setCategory] = useState("交流・コミュニティ");
  const [feeType, setFeeType] = useState<AizuEvent["feeType"]>("無料");
  const [feeAmount, setFeeAmount] = useState(0);
  const [commercialSellerName, setCommercialSellerName] = useState("");
  const [commercialSellerAddress, setCommercialSellerAddress] = useState("");
  const [commercialSellerPhone, setCommercialSellerPhone] = useState("");
  const [commercialResponsiblePerson, setCommercialResponsiblePerson] =
    useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentTiming, setPaymentTiming] = useState("");
  const [additionalFees, setAdditionalFees] = useState("なし");
  const [eventFormat, setEventFormat] =
    useState<AizuEvent["eventFormat"]>("現地");
  const [meetingPoint, setMeetingPoint] = useState("会津若松市");
  const [accessInfo, setAccessInfo] = useState("");
  const [bringItems, setBringItems] = useState("特になし");
  const [cancellationPolicy, setCancellationPolicy] = useState(
    "参加できなくなった場合は、開催前日までに活動ページからキャンセルしてください。",
  );
  const [weatherPolicy, setWeatherPolicy] = useState(
    "変更・中止の場合は通知と全体チャットで案内します。",
  );
  const [accessibility, setAccessibility] = useState(
    "必要な配慮は参加申請時にお知らせください。",
  );
  const [contactMethod, setContactMethod] = useState(
    "申請後の全体チャットでお問い合わせください。",
  );
  const [organizerDescription, setOrganizerDescription] = useState(
    "参加者が安心して参加できるよう、事前連絡と当日の案内を行います。",
  );
  const [organizerExperience, setOrganizerExperience] = useState(
    "Aizu Connectでイベントを企画",
  );
  const [templateKey, setTemplateKey] = useState<string>(eventTemplates[0].key);
  const [beginnerLevel, setBeginnerLevel] =
    useState<AizuEvent["beginnerLevel"]>("初参加歓迎");
  const [takeawayText, setTakeawayText] = useState("");
  const [applicationQuestions, setApplicationQuestions] = useState<
    ApplicationQuestion[]
  >([]);
  const [cancellationDeadlineInput, setCancellationDeadlineInput] =
    useState("");
  const [eventImageFile, setEventImageFile] = useState<File | null>(null);
  const [eventImagePreview, setEventImagePreview] = useState<string | null>(
    eventTemplates[0].imageUrl,
  );
  const [eventImageSourceFile, setEventImageSourceFile] = useState<File | null>(
    null,
  );
  const [eventImageSourcePreview, setEventImageSourcePreview] = useState<
    string | null
  >(null);
  const [isEventImageReviewOpen, setIsEventImageReviewOpen] = useState(false);
  const [isEventPreviewOpen, setIsEventPreviewOpen] = useState(false);
  const [eventImageInputKey, setEventImageInputKey] = useState(0);
  const [eventFormStep, setEventFormStep] = useState<1 | 2 | 3>(1);

  const eventFormRef = useRef<HTMLFormElement>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [isDraftSaving, setIsDraftSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [eventImageUploadProgress, setEventImageUploadProgress] = useState<
    number | null
  >(null);
  const [isDraftReady, setIsDraftReady] = useState(false);

  const selectedTemplate =
    eventTemplates.find((template) => template.key === templateKey) ??
    eventTemplates[0];

  const moveToEventFormStep = (step: 1 | 2 | 3) => {
    if (step > eventFormStep) {
      const currentSection = eventFormRef.current?.querySelector<HTMLElement>(
        `[data-event-form-step="${eventFormStep}"]`,
      );
      const invalidField = currentSection?.querySelector<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >("input:invalid, textarea:invalid, select:invalid");
      if (invalidField) {
        invalidField.reportValidity();
        invalidField.focus();
        return;
      }
    }
    setEventFormStep(step);
    window.scrollTo({ top: 0, behavior: preferredScrollBehavior() });
  };

  const beginEditEvent = (event: AizuEvent) => {
    showOrganizationView("create");
    revokeObjectUrl(eventImagePreview);
    revokeObjectUrl(eventImageSourcePreview);
    setEventFormStep(1);
    setEditingEventId(event.id);
    setTitle(event.title);
    setSummary(event.summary);
    setLocation(event.location);
    setStartAtInput(toDateTimeInput(event.startAt));
    setEndAtInput(toDateTimeInput(event.endAt));
    setCapacity(event.capacity);
    setCategory(event.category);
    setFeeType(event.feeType ?? "無料");
    setFeeAmount(event.feeAmount ?? 0);
    setCommercialSellerName(event.commercialSellerName ?? "");
    setCommercialSellerAddress(event.commercialSellerAddress ?? "");
    setCommercialSellerPhone(event.commercialSellerPhone ?? "");
    setCommercialResponsiblePerson(event.commercialResponsiblePerson ?? "");
    setPaymentMethod(event.paymentMethod ?? "");
    setPaymentTiming(event.paymentTiming ?? "");
    setAdditionalFees(event.additionalFees ?? "なし");
    setEventFormat(event.eventFormat ?? "現地");
    setMeetingPoint(event.meetingPoint ?? event.location);
    setAccessInfo(event.accessInfo ?? "");
    setBringItems(event.bringItems ?? "特になし");
    setCancellationPolicy(
      event.cancellationPolicy ??
        "参加できなくなった場合は、開催前日までに活動ページからキャンセルしてください。",
    );
    setWeatherPolicy(
      event.weatherPolicy ??
        "変更・中止の場合は通知と全体チャットで案内します。",
    );
    setAccessibility(
      event.accessibility ?? "必要な配慮は参加申請時にお知らせください。",
    );
    setContactMethod(
      event.contactMethod ?? "申請後の全体チャットでお問い合わせください。",
    );
    setOrganizerDescription(
      event.organizerDescription ??
        "参加者が安心して参加できるよう、事前連絡と当日の案内を行います。",
    );
    setOrganizerExperience(
      event.organizerExperience ?? "Aizu Connectでイベントを企画",
    );
    setTemplateKey(event.templateKey ?? eventTemplates[0].key);
    setBeginnerLevel(event.beginnerLevel ?? "誰でも歓迎");
    setTakeawayText((event.takeaways ?? defaultTakeaways).join("\n"));
    setApplicationQuestions(event.applicationQuestions ?? []);
    setCancellationDeadlineInput(toDateTimeInput(event.cancellationDeadline));
    setEventImageFile(null);
    setEventImagePreview(event.imageUrl);
    setEventImageSourceFile(null);
    setEventImageSourcePreview(null);
    setIsEventImageReviewOpen(false);
    setNotice(
      event.status === "published"
        ? "公開中イベントの変更は、再審査後に反映されます。"
        : "イベントを修正して再申請できます。",
      "info",
    );
  };

  const clearEventForm = () => {
    revokeObjectUrl(eventImagePreview);
    revokeObjectUrl(eventImageSourcePreview);
    setEventFormStep(1);
    setEditingEventId(null);
    setTitle("");
    setSummary("");
    setLocation("会津若松市");
    setStartAtInput("");
    setEndAtInput("");
    setCapacity(20);
    setCategory("交流・コミュニティ");
    setFeeType("無料");
    setFeeAmount(0);
    setCommercialSellerName("");
    setCommercialSellerAddress("");
    setCommercialSellerPhone("");
    setCommercialResponsiblePerson("");
    setPaymentMethod("");
    setPaymentTiming("");
    setAdditionalFees("なし");
    setEventFormat("現地");
    setMeetingPoint("会津若松市");
    setAccessInfo("");
    setBringItems("特になし");
    setCancellationPolicy(
      "参加できなくなった場合は、開催前日までに活動ページからキャンセルしてください。",
    );
    setWeatherPolicy("変更・中止の場合は通知と全体チャットで案内します。");
    setAccessibility("必要な配慮は参加申請時にお知らせください。");
    setContactMethod("申請後の全体チャットでお問い合わせください。");
    setOrganizerDescription(
      "参加者が安心して参加できるよう、事前連絡と当日の案内を行います。",
    );
    setOrganizerExperience("Aizu Connectでイベントを企画");
    setTemplateKey(eventTemplates[0].key);
    setBeginnerLevel("初参加歓迎");
    setTakeawayText("");
    setApplicationQuestions([]);
    setCancellationDeadlineInput("");
    setEventImageFile(null);
    setEventImagePreview(eventTemplates[0].imageUrl);
    setEventImageSourceFile(null);
    setEventImageSourcePreview(null);
    setIsEventImageReviewOpen(false);
  };

  const duplicateEvent = (event: AizuEvent) => {
    beginEditEvent(event);
    const duplicateTemplate =
      eventTemplates.find((template) => template.key === event.templateKey) ??
      eventTemplates[0];
    setEditingEventId(null);
    setSelectedEventId(null);
    setTitle(`${event.title}（複製）`.slice(0, 80));
    setStartAtInput("");
    setEndAtInput("");
    setEventImageFile(null);
    setEventImagePreview(duplicateTemplate.imageUrl);
    setNotice(
      "イベントを複製しました。写真と開催日時を確認して申請してください。",
      "info",
    );
  };

  useEffect(() => {
    const stored = window.localStorage.getItem(
      `aizu-connect:event-draft:${appUser.uid}`,
    );
    if (stored) {
      try {
        const draft = JSON.parse(stored) as Record<string, unknown>;
        const draftTemplate =
          eventTemplates.find(
            (template) => template.key === String(draft.templateKey ?? ""),
          ) ?? eventTemplates[0];
        const restoredTitle =
          String(draft.title ?? "") === draftTemplate.title
            ? ""
            : String(draft.title ?? "");
        const restoredSummary =
          String(draft.summary ?? "") === draftTemplate.summary
            ? ""
            : String(draft.summary ?? "");
        const restoredTakeaways =
          String(draft.takeawayText ?? "") ===
          draftTemplate.takeaways.join("\n")
            ? ""
            : String(draft.takeawayText ?? "");
        const hasMeaningfulDraft = [
          restoredTitle,
          restoredSummary,
          draft.startAtInput,
        ].some((value) => typeof value === "string" && value.trim().length > 0);
        if (!hasMeaningfulDraft) {
          window.localStorage.removeItem(
            `aizu-connect:event-draft:${appUser.uid}`,
          );
          setIsDraftReady(true);
          return;
        }
        setTitle(restoredTitle);
        setSummary(restoredSummary);
        setLocation(String(draft.location ?? "会津若松市"));
        setMeetingPoint(String(draft.meetingPoint ?? "会津若松市"));
        setStartAtInput(String(draft.startAtInput ?? ""));
        setEndAtInput(String(draft.endAtInput ?? ""));
        setCapacity(Number(draft.capacity ?? 20));
        setCategory(String(draft.category ?? "交流・コミュニティ"));
        setTemplateKey(String(draft.templateKey ?? eventTemplates[0].key));
        setBeginnerLevel(
          (draft.beginnerLevel as AizuEvent["beginnerLevel"]) ?? "初参加歓迎",
        );
        setTakeawayText(restoredTakeaways);
        setApplicationQuestions(
          Array.isArray(draft.applicationQuestions)
            ? (draft.applicationQuestions as ApplicationQuestion[])
            : [],
        );
        setCancellationDeadlineInput(
          String(draft.cancellationDeadlineInput ?? ""),
        );
        setFeeType((draft.feeType as AizuEvent["feeType"]) ?? "無料");
        setFeeAmount(Number(draft.feeAmount ?? 0));
        setCommercialSellerName(String(draft.commercialSellerName ?? ""));
        setCommercialSellerAddress(String(draft.commercialSellerAddress ?? ""));
        setCommercialSellerPhone(String(draft.commercialSellerPhone ?? ""));
        setCommercialResponsiblePerson(
          String(draft.commercialResponsiblePerson ?? ""),
        );
        setPaymentMethod(String(draft.paymentMethod ?? ""));
        setPaymentTiming(String(draft.paymentTiming ?? ""));
        setAdditionalFees(String(draft.additionalFees ?? "なし"));
        setEventFormat(
          (draft.eventFormat as AizuEvent["eventFormat"]) ?? "現地",
        );
        setAccessInfo(String(draft.accessInfo ?? ""));
        setBringItems(String(draft.bringItems ?? "特になし"));
        setCancellationPolicy(String(draft.cancellationPolicy ?? ""));
        setWeatherPolicy(String(draft.weatherPolicy ?? ""));
        setAccessibility(String(draft.accessibility ?? ""));
        setContactMethod(String(draft.contactMethod ?? ""));
        setOrganizerDescription(String(draft.organizerDescription ?? ""));
        setOrganizerExperience(String(draft.organizerExperience ?? ""));
        setNotice("保存されていた下書きを復元しました。", "info");
      } catch {
        window.localStorage.removeItem(
          `aizu-connect:event-draft:${appUser.uid}`,
        );
      }
    }
    setIsDraftReady(true);
  }, [appUser.uid, setNotice]);

  useEffect(() => {
    if (!isDraftReady || editingEventId) return;
    const draft = {
      title,
      summary,
      location,
      meetingPoint,
      startAtInput,
      endAtInput,
      capacity,
      category,
      templateKey,
      beginnerLevel,
      takeawayText,
      applicationQuestions,
      cancellationDeadlineInput,
      feeType,
      feeAmount,
      commercialSellerName,
      commercialSellerAddress,
      commercialSellerPhone,
      commercialResponsiblePerson,
      paymentMethod,
      paymentTiming,
      additionalFees,
      eventFormat,
      accessInfo,
      bringItems,
      cancellationPolicy,
      weatherPolicy,
      accessibility,
      contactMethod,
      organizerDescription,
      organizerExperience,
    };
    const timer = window.setTimeout(() => {
      const hasMeaningfulDraft = Boolean(
        title.trim() || summary.trim() || startAtInput.trim(),
      );
      if (hasMeaningfulDraft) {
        window.localStorage.setItem(
          `aizu-connect:event-draft:${appUser.uid}`,
          JSON.stringify(draft),
        );
        setDraftSavedAt(new Date());
      } else {
        window.localStorage.removeItem(
          `aizu-connect:event-draft:${appUser.uid}`,
        );
        setDraftSavedAt(null);
      }
      setIsDraftSaving(false);
    }, 400);
    setIsDraftSaving(true);
    return () => window.clearTimeout(timer);
  }, [
    accessInfo,
    accessibility,
    appUser.uid,
    beginnerLevel,
    bringItems,
    cancellationPolicy,
    capacity,
    category,
    contactMethod,
    editingEventId,
    endAtInput,
    eventFormat,
    feeAmount,
    feeType,
    commercialSellerName,
    commercialSellerAddress,
    commercialSellerPhone,
    commercialResponsiblePerson,
    paymentMethod,
    paymentTiming,
    additionalFees,
    isDraftReady,
    location,
    meetingPoint,
    organizerDescription,
    organizerExperience,
    startAtInput,
    summary,
    takeawayText,
    applicationQuestions,
    cancellationDeadlineInput,
    templateKey,
    title,
    weatherPolicy,
  ]);

  const applyTemplate = (template: (typeof eventTemplates)[number]) => {
    revokeObjectUrl(eventImagePreview);
    revokeObjectUrl(eventImageSourcePreview);
    setTemplateKey(template.key);
    setCategory(template.category);
    setBeginnerLevel(template.beginnerLevel);
    setEventImageFile(null);
    setEventImagePreview(template.imageUrl);
    setEventImageSourceFile(null);
    setEventImageSourcePreview(null);
    setNotice(
      "テンプレートの例文を表示しました。入力した内容だけが保存されます。",
      "info",
    );
  };

  const createEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !title.trim() ||
      !summary.trim() ||
      !takeawayText.trim() ||
      !startAtInput.trim()
    ) {
      setNotice(
        "タイトル、概要、体験できること、開催日時を入力してください。",
        "error",
      );
      return;
    }
    const startAtDate = new Date(startAtInput);
    if (Number.isNaN(startAtDate.getTime())) {
      setNotice("開催日時の形式を確認してください。", "error");
      return;
    }
    if (!isFutureEventStart(startAtDate)) {
      setNotice("開催日時は現在より後の日時を指定してください。", "error");
      return;
    }
    const endAtDate = endAtInput
      ? new Date(endAtInput)
      : new Date(startAtDate.getTime() + 2 * 60 * 60 * 1000);
    if (
      Number.isNaN(endAtDate.getTime()) ||
      endAtDate.getTime() <= startAtDate.getTime()
    ) {
      setNotice("終了日時は開催日時より後にしてください。", "error");
      return;
    }
    if (
      feeType === "有料" &&
      ![
        commercialSellerAddress,
        commercialSellerPhone,
        commercialResponsiblePerson,
        paymentMethod,
        paymentTiming,
        additionalFees,
        cancellationPolicy,
      ].every((value) => value.trim().length > 0)
    ) {
      setNotice(
        "有料イベントは、特定商取引法に基づく表示をすべて入力してください。",
        "error",
      );
      return;
    }
    setIsLoading(true);
    setEventImageUploadProgress(eventImageFile ? 0 : null);
    setNotice("");
    try {
      const eventId = editingEventId ?? doc(collection(db, "events")).id;
      const takeaways = takeawayText
        .split(/\n|,/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 3);
      const currentEvent = events.find((item) => item.id === eventId);
      const templateImage =
        eventTemplates.find((template) => template.key === templateKey)
          ?.imageUrl ?? eventTemplates[0].imageUrl;
      const imageUrl = eventImageFile
        ? await uploadImage(
            eventImageFile,
            `event-images/${appUser.uid}/${eventId}/cover-${Date.now()}`,
            setEventImageUploadProgress,
          )
        : new URL(
            currentEvent?.imageUrl ?? templateImage,
            window.location.origin,
          ).toString();
      if (!imageUrl) {
        throw new Error(
          "イベント画像を設定できませんでした。もう一度お試しください。",
        );
      }
      const eventData = {
        title: title.trim().slice(0, 80),
        summary: summary.trim().slice(0, 220),
        category,
        location: location.trim().slice(0, 80),
        startAtMillis: startAtDate.getTime(),
        endAtMillis: endAtDate.getTime(),
        feeType: feeType ?? "無料",
        feeAmount:
          feeType === "有料"
            ? Math.max(0, Math.min(Number(feeAmount) || 0, 1_000_000))
            : 0,
        commercialSellerName:
          feeType === "有料"
            ? (commercialSellerName.trim() || organizationName).slice(0, 120)
            : "",
        commercialSellerAddress:
          feeType === "有料"
            ? commercialSellerAddress.trim().slice(0, 240)
            : "",
        commercialSellerPhone:
          feeType === "有料" ? commercialSellerPhone.trim().slice(0, 40) : "",
        commercialResponsiblePerson:
          feeType === "有料"
            ? commercialResponsiblePerson.trim().slice(0, 80)
            : "",
        paymentMethod:
          feeType === "有料" ? paymentMethod.trim().slice(0, 200) : "",
        paymentTiming:
          feeType === "有料" ? paymentTiming.trim().slice(0, 200) : "",
        additionalFees:
          feeType === "有料" ? additionalFees.trim().slice(0, 200) : "なし",
        eventFormat: eventFormat ?? "現地",
        meetingPoint: meetingPoint.trim().slice(0, 160),
        accessInfo: accessInfo.trim().slice(0, 300),
        bringItems: bringItems.trim().slice(0, 300),
        cancellationPolicy: cancellationPolicy.trim().slice(0, 500),
        cancellationDeadlineMillis: cancellationDeadlineInput
          ? new Date(cancellationDeadlineInput).getTime()
          : undefined,
        weatherPolicy: weatherPolicy.trim().slice(0, 500),
        accessibility: accessibility.trim().slice(0, 500),
        contactMethod: contactMethod.trim().slice(0, 300),
        capacity: Math.round(Math.max(1, Math.min(capacity, 1000))),
        imageUrl,
        templateKey,
        beginnerLevel,
        takeaways,
        organizerDescription: organizerDescription.trim().slice(0, 500),
        organizerExperience: organizerExperience.trim().slice(0, 300),
        applicationQuestions,
      };
      const savePlan = httpsCallable<
        {
          eventId: string;
          mode: "create" | "update";
          event: Record<string, unknown>;
        },
        { eventId: string; status: "pending_review" }
      >(functions, "saveEventPlan");
      await savePlan({
        eventId,
        mode: editingEventId ? "update" : "create",
        event: eventData,
      });
      window.localStorage.removeItem(`aizu-connect:event-draft:${appUser.uid}`);
      clearEventForm();
      await loadEvents();
      setNotice(
        editingEventId
          ? "活動を修正して再申請しました。"
          : "活動を審査へ申請しました。管理者の確認をお待ちください。",
        "success",
      );
      showOrganizationView("events");
    } catch (error) {
      setNotice(getFirebaseErrorMessage(error), "error");
    } finally {
      setIsLoading(false);
      setEventImageUploadProgress(null);
    }
  };

  const buildPreviewEvent = (): AizuEvent => {
    const previewStartAt = startAtInput ? new Date(startAtInput) : undefined;
    const previewEndAt = endAtInput ? new Date(endAtInput) : undefined;
    return {
      id: editingEventId ?? "preview",
      title: title.trim() || "イベント名",
      summary: summary.trim() || "イベントの概要がここに表示されます。",
      category,
      location: location.trim() || "会津若松市",
      startAtLabel: startAtInput
        ? formatEventStart(startAtInput)
        : "日時未設定",
      startAt:
        previewStartAt && Number.isFinite(previewStartAt.getTime())
          ? Timestamp.fromDate(previewStartAt)
          : undefined,
      endAtLabel:
        previewEndAt && Number.isFinite(previewEndAt.getTime())
          ? new Intl.DateTimeFormat("ja-JP", {
              hour: "numeric",
              minute: "2-digit",
            }).format(previewEndAt)
          : undefined,
      endAt:
        previewEndAt && Number.isFinite(previewEndAt.getTime())
          ? Timestamp.fromDate(previewEndAt)
          : undefined,
      feeType,
      feeAmount,
      eventFormat,
      meetingPoint,
      accessInfo,
      bringItems,
      cancellationPolicy,
      cancellationDeadline:
        cancellationDeadlineInput &&
        Number.isFinite(new Date(cancellationDeadlineInput).getTime())
          ? Timestamp.fromDate(new Date(cancellationDeadlineInput))
          : undefined,
      weatherPolicy,
      accessibility,
      contactMethod,
      applicationQuestions,
      organizationName,
      status: "pending_review",
      capacity,
      applicantCount: 0,
      imageUrl: eventImagePreview ?? eventTemplates[0].imageUrl,
      tags: [category, "学生歓迎"],
      templateKey,
      beginnerLevel,
      takeaways: takeawayText
        .split(/\n|,/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 3),
      organizerDescription,
      organizerExperience,
      organizationVerified: appUser.role === "organization",
      createdBy: appUser.uid,
    };
  };
  return {
    organizationName,
    editingEventId,
    setEditingEventId,
    title,
    setTitle,
    summary,
    setSummary,
    location,
    setLocation,
    startAtInput,
    setStartAtInput,
    endAtInput,
    setEndAtInput,
    capacity,
    setCapacity,
    category,
    setCategory,
    feeType,
    setFeeType,
    feeAmount,
    setFeeAmount,
    commercialSellerName,
    setCommercialSellerName,
    commercialSellerAddress,
    setCommercialSellerAddress,
    commercialSellerPhone,
    setCommercialSellerPhone,
    commercialResponsiblePerson,
    setCommercialResponsiblePerson,
    paymentMethod,
    setPaymentMethod,
    paymentTiming,
    setPaymentTiming,
    additionalFees,
    setAdditionalFees,
    eventFormat,
    setEventFormat,
    meetingPoint,
    setMeetingPoint,
    accessInfo,
    setAccessInfo,
    bringItems,
    setBringItems,
    cancellationPolicy,
    setCancellationPolicy,
    weatherPolicy,
    setWeatherPolicy,
    accessibility,
    setAccessibility,
    contactMethod,
    setContactMethod,
    organizerDescription,
    setOrganizerDescription,
    organizerExperience,
    setOrganizerExperience,
    templateKey,
    beginnerLevel,
    setBeginnerLevel,
    takeawayText,
    setTakeawayText,
    applicationQuestions,
    setApplicationQuestions,
    cancellationDeadlineInput,
    setCancellationDeadlineInput,
    eventImageFile,
    setEventImageFile,
    eventImagePreview,
    setEventImagePreview,
    eventImageSourceFile,
    setEventImageSourceFile,
    eventImageSourcePreview,
    setEventImageSourcePreview,
    isEventImageReviewOpen,
    setIsEventImageReviewOpen,
    isEventPreviewOpen,
    setIsEventPreviewOpen,
    eventImageInputKey,
    setEventImageInputKey,
    eventFormStep,
    setEventFormStep,
    eventFormRef,
    draftSavedAt,
    isDraftSaving,
    isLoading,
    eventImageUploadProgress,
    selectedTemplate,
    moveToEventFormStep,
    beginEditEvent,
    clearEventForm,
    duplicateEvent,
    applyTemplate,
    createEvent,
    buildPreviewEvent,
  };
}
export type OrganizationEventEditor = ReturnType<
  typeof useOrganizationEventEditor
>;
