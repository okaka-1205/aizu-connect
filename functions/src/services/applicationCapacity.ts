import {FieldValue} from "firebase-admin/firestore";
import {db} from "../lib/firebaseAdmin";

// Call before any other transaction writes: the next waitlisted application
// must be read in the same transaction as the capacity change.
export const releaseApplicationCapacity = async (
  transaction: FirebaseFirestore.Transaction,
  eventRef: FirebaseFirestore.DocumentReference,
) => {
  const event = await transaction.get(eventRef);
  if (!event.exists || event.data()?.status === "cancelled") return;
  const waiting = db
    .collection("eventApplications")
    .where("eventId", "==", eventRef.id)
    .where("status", "==", "waitlisted");
  const ordered = await transaction.get(
    waiting.orderBy("waitlistSequence", "asc").limit(1),
  );
  const next =
    ordered.docs[0] ??
    (await transaction.get(waiting.orderBy("createdAt", "asc").limit(1)))
      .docs[0];
  if (next) {
    transaction.update(next.ref, {
      status: "pending",
      waitlistPosition: FieldValue.delete(),
      waitlistSequence: FieldValue.delete(),
      promotedFromWaitlist: true,
    });
  } else {
    transaction.update(eventRef, {
      applicantCount: Math.max(
        0,
        Number(event.data()?.applicantCount ?? 0) - 1,
      ),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
};
