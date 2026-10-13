import { getIdToken, reload } from "firebase/auth";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, storage } from "./firebase";

export const uploadImage = async (file: File, path: string) => {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("ログイン状態を確認できません。再ログインしてください。");
  }
  await reload(currentUser);
  await getIdToken(currentUser, true);
  const imageRef = ref(storage, path);
  const snapshot = await uploadBytes(imageRef, file, {
    contentType: file.type,
    cacheControl: "public,max-age=3600",
  });
  return getDownloadURL(snapshot.ref);
};
