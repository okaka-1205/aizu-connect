import {
  createUserWithEmailAndPassword,
  deleteUser,
  getIdToken,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "../lib/firebase";

export const loginWithEmail = (email: string, password: string) =>
  signInWithEmailAndPassword(auth, email, password);

export const registerWithEmail = (email: string, password: string) =>
  createUserWithEmailAndPassword(auth, email, password);

export const logout = () => signOut(auth);

export const requestPasswordReset = (email: string) =>
  sendPasswordResetEmail(auth, email);

export const resendVerificationEmail = (user: User) =>
  sendEmailVerification(user);

export const reloadAuthUser = (user: User) => reload(user);

export const refreshAuthToken = (user: User) => getIdToken(user, true);

export const deleteAuthUser = (user: User) => deleteUser(user);
