import { getIdToken, reload } from "firebase/auth";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { auth, storage } from "./firebase";

export const uploadImage = async (
  file: File,
  path: string,
  onProgress?: (progress: number) => void,
) => {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("ログイン状態を確認できません。再ログインしてください。");
  }
  await reload(currentUser);
  await getIdToken(currentUser, true);
  const imageRef = ref(storage, path);
  onProgress?.(0);
  const uploadTask = uploadBytesResumable(
    imageRef,
    file,
    {
      contentType: file.type,
      cacheControl: "public,max-age=3600",
    },
  );
  const snapshot = await new Promise<typeof uploadTask.snapshot>(
    (resolve, reject) => {
      uploadTask.on(
        "state_changed",
        (uploadSnapshot) => {
          const progress =
            uploadSnapshot.totalBytes > 0
              ? Math.round(
                  (uploadSnapshot.bytesTransferred /
                    uploadSnapshot.totalBytes) *
                    100,
                )
              : 0;
          onProgress?.(progress);
        },
        reject,
        () => resolve(uploadTask.snapshot),
      );
    },
  );
  onProgress?.(100);
  return getDownloadURL(snapshot.ref);
};
