import {FieldValue} from "firebase-admin/firestore";
import {db} from "../lib/firebaseAdmin";
import {isLiveResource} from "./resourceLifecycle";

// Recompute current state rather than applying event deltas: retries and
// out-of-order triggers must converge to the same count and metadata.
export const refreshOrganizerProfile = async (organizerId: string) =>
  db.runTransaction(async (transaction) => {
    const profileRef = db.doc(`publicOrganizerProfiles/${organizerId}`);
    const [owner, profile] = await transaction.getAll(
      db.doc(`users/${organizerId}`),
      profileRef,
    );
    if (!isLiveResource(owner)) return;
    const published = db
      .collection("events")
      .where("createdBy", "==", organizerId)
      .where("status", "==", "published");
    const total = await transaction.get(published.count());
    const latest = await transaction.get(
      published.orderBy("startAt", "desc").limit(1),
    );
    const data = latest.docs[0]?.data();
    if (!profile.exists && !data) return;
    transaction.set(
      profileRef,
      {
        ...(data ?
          {
            userId: organizerId,
            displayName: data.organizationName,
            description:
                data.organizerDescription ??
                "参加者が安心して参加できるイベント運営を行います。",
            experience:
                data.organizerExperience ?? "Aizu Connectでイベントを企画",
            verified: data.organizationVerified === true,
          } :
          {}),
        publishedEventCount: total.data().count,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  });
