import { type MultiFactorResolver, type User } from "firebase/auth";
import {
  doc,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { useState, type FormEvent } from "react";
import { PRIVACY_VERSION, TERMS_VERSION } from "../content/legalMetadata";
import {
  getAuthFlowErrorMessage,
  getFirebaseErrorMessage,
  isAizuUniversityEmail,
  normalizeLoginEmail,
  resolveInitialAccountStatus,
  type AuthFlowStage,
} from "../lib/appLogic";
import { authPersistenceReady, db, ensureAppCheck } from "../lib/firebase";
import {
  deleteAuthUser,
  loginWithEmail,
  logout,
  registerWithEmail,
  resendVerificationEmail,
} from "../services/authService";
import {
  createMultiFactorResolver,
  isMultiFactorRequiredError,
} from "../services/mfaService";
import type {
  AccountStatus,
  AppUser,
  NoticeTone,
  SetNotice,
} from "../types/domain";

export function useAuthForm({
  setMessage,
  setIsActionLoading,
  setAppUser,
  setMfaResolver,
}: {
  setMessage: SetNotice;
  setIsActionLoading: (loading: boolean) => void;
  setAppUser: (user: AppUser) => void;
  setMfaResolver: (resolver: MultiFactorResolver) => void;
}) {
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [accountType, setAccountType] = useState<"student" | "organization">(
    "student",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [department, setDepartment] = useState("");
  const [grade, setGrade] = useState(1);
  const [interestText, setInterestText] = useState("");
  const [currentActivities, setCurrentActivities] = useState("");
  const [wantToTry, setWantToTry] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [hasAcceptedLegal, setHasAcceptedLegal] = useState(false);
  const [hasConfirmedEligibility, setHasConfirmedEligibility] = useState(false);

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    const devAdminEmail = import.meta.env.DEV
      ? (import.meta.env.VITE_DEV_ADMIN_EMAIL ?? "").trim().toLowerCase()
      : "";
    const devAdminPassword = import.meta.env.DEV
      ? (import.meta.env.VITE_DEV_ADMIN_PASSWORD ?? "")
      : "";
    const normalizedEmail =
      authMode === "login"
        ? normalizeLoginEmail(email, devAdminEmail)
        : email.trim().toLowerCase();
    const normalizedPassword =
      devAdminEmail && normalizedEmail === devAdminEmail && password === "admin"
        ? devAdminPassword
        : password;
    if (!normalizedEmail || !password) {
      setMessage("メールアドレスとパスワードを入力してください。", "error");
      return;
    }
    if (authMode === "register") {
      if (!hasAcceptedLegal) {
        setMessage(
          "利用規約とプライバシーポリシーを確認し、同意してください。",
          "error",
        );
        return;
      }
      if (!hasConfirmedEligibility) {
        setMessage(
          "年齢条件を確認し、未成年の場合は法定代理人の同意を得てください。",
          "error",
        );
        return;
      }
      if (password.length < 10) {
        setMessage("パスワードは10文字以上にしてください。", "error");
        return;
      }
      if (accountType === "student" && !displayName.trim()) {
        setMessage("表示名を入力してください。", "error");
        return;
      }
      if (accountType === "organization" && !organizationName.trim()) {
        setMessage("団体・自治体名を入力してください。", "error");
        return;
      }
    }
    setIsActionLoading(true);
    let createdUser: User | null = null;
    let authFlowStage: AuthFlowStage = "persistence";
    try {
      // The persistence mode must be settled before sign-in/sign-up. Without
      // this await, a fast login can race the initial auth state observer and
      // appear to be lost after a reload.
      await authPersistenceReady;
      authFlowStage = "app_check";
      await ensureAppCheck();
      if (authMode === "login") {
        authFlowStage = "sign_in";
        await loginWithEmail(normalizedEmail, normalizedPassword);
        setMessage("");
        return;
      }
      authFlowStage = "create_account";
      const credential = await registerWithEmail(normalizedEmail, password);
      createdUser = credential.user;
      const interests = interestText
        .split(",")
        .map((interest) => interest.trim())
        .filter(Boolean)
        .slice(0, 5);
      const normalizedCurrentActivities = currentActivities
        .trim()
        .slice(0, 240);
      const normalizedWantToTry = wantToTry.trim().slice(0, 240);
      const isStudent = accountType === "student";
      const isAizuStudent = isStudent && isAizuUniversityEmail(normalizedEmail);
      const status: AccountStatus = resolveInitialAccountStatus({
        role: accountType,
        email: normalizedEmail,
      });
      const normalizedOrganizationName = organizationName.trim().slice(0, 100);
      const normalizedDisplayName = isStudent
        ? displayName.trim().slice(0, 80)
        : normalizedOrganizationName.slice(0, 80);
      const userData: AppUser = {
        uid: credential.user.uid,
        role: accountType,
        status,
        email: credential.user.email,
        displayName: normalizedDisplayName,
        university: isStudent
          ? isAizuStudent
            ? "会津大学"
            : "その他"
          : "主催者・団体",
        department: isStudent ? department.trim().slice(0, 80) : "",
        grade: isStudent ? grade : 0,
        interests: isStudent ? interests : [],
        ...(isStudent
          ? {
              currentActivities: normalizedCurrentActivities,
              wantToTry: normalizedWantToTry,
            }
          : {
              organizationId: credential.user.uid,
              organizationName: normalizedOrganizationName,
            }),
      };
      const batch = writeBatch(db);
      batch.set(doc(db, "users", credential.user.uid), {
        ...userData,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        legalAcceptedAt: serverTimestamp(),
        eligibilityConfirmedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(
        doc(
          db,
          "legalConsents",
          `${credential.user.uid}_${TERMS_VERSION}_${PRIVACY_VERSION}`,
        ),
        {
          userId: credential.user.uid,
          termsVersion: TERMS_VERSION,
          privacyVersion: PRIVACY_VERSION,
          acceptedAt: serverTimestamp(),
          eligibilityConfirmedAt: serverTimestamp(),
          source: "registration",
        },
      );
      if (isStudent) {
        batch.set(doc(db, "studentProfiles", credential.user.uid), {
          ...userData,
          verificationMethod: isAizuStudent
            ? "university_email"
            : "manual_review",
          profileCompletionRate: 80,
          activityCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(doc(db, "organizations", credential.user.uid), {
          id: credential.user.uid,
          displayName: normalizedOrganizationName,
          description: "",
          contactEmail: normalizedEmail,
          status: "pending_approval",
          createdBy: credential.user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      authFlowStage = "save_profile";
      await batch.commit();
      let registrationMessage =
        isStudent && isAizuStudent
          ? "登録しました。メール認証が完了すると、すぐに利用できます。"
          : "登録しました。メール認証と管理者の承認後に利用できます。";
      let registrationTone: NoticeTone = "success";
      try {
        await resendVerificationEmail(credential.user);
      } catch (verificationError) {
        registrationTone = "info";
        registrationMessage = `登録は完了しましたが、確認メールを送信できませんでした。${getFirebaseErrorMessage(verificationError)}`;
      }
      setAppUser({
        ...userData,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        legalAcceptedAt: Timestamp.now(),
        eligibilityConfirmedAt: Timestamp.now(),
      });
      setMessage(registrationMessage, registrationTone);
    } catch (error) {
      if (authMode === "login" && isMultiFactorRequiredError(error)) {
        setMfaResolver(createMultiFactorResolver(error));
        setPassword("");
        setMessage("");
        return;
      }
      let rollbackFailed = false;
      if (createdUser) {
        await deleteAuthUser(createdUser).catch(async () => {
          rollbackFailed = true;
          await logout().catch(() => undefined);
        });
      }
      const errorCode =
        typeof error === "object" && error !== null && "code" in error
          ? String(error.code)
          : "unknown";
      console.error("Authentication flow failed", {
        stage: authFlowStage,
        code: errorCode,
        rollbackFailed,
      });
      setMessage(
        getAuthFlowErrorMessage({
          stage: authFlowStage,
          error,
          rollbackFailed,
        }),
        "error",
      );
    } finally {
      setIsActionLoading(false);
    }
  };
  return {
    authMode,
    setAuthMode,
    accountType,
    setAccountType,
    email,
    setEmail,
    password,
    setPassword,
    showPassword,
    setShowPassword,
    displayName,
    setDisplayName,
    department,
    setDepartment,
    grade,
    setGrade,
    interestText,
    setInterestText,
    currentActivities,
    setCurrentActivities,
    wantToTry,
    setWantToTry,
    organizationName,
    setOrganizationName,
    hasAcceptedLegal,
    setHasAcceptedLegal,
    hasConfirmedEligibility,
    setHasConfirmedEligibility,
    handleAuthSubmit,
  };
}
