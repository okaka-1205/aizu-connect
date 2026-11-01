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
      capacityHeld: true,
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

// A cancellation trigger may still be queued when account deletion starts.
// Settle that reservation here, using legacy receipts when no marker exists.
export const releaseDeletedApplicationCapacity = async (
  transaction: FirebaseFirestore.Transaction,
  application: FirebaseFirestore.DocumentSnapshot,
) => {
  const data = application.data();
  if (!data || data.capacityReleased === true) return;
  const terminal = ["cancelled", "rejected"].includes(data.status);
  const reserved = data.capacityHeld === true ||
    (data.capacityHeld !== false && !data.waitlistSequence &&
      !data.waitlistPosition);
  let alreadyReleased = false;
  if (terminal && reserved) {
    const receipts = await transaction.getAll(...["pending", "confirmed"]
      .map((before) => db.doc("functionReceipts/" +
        ["application", application.id, before, data.status].join("_"))));
    alreadyReleased = receipts.some((receipt) => receipt.exists);
  }
  const pending = ["pending", "confirmed"].includes(data.status);
  if (typeof data.eventId === "string" && !alreadyReleased &&
    (pending || (terminal && reserved))) {
    await releaseApplicationCapacity(
      transaction, db.doc(`events/${data.eventId}`),
    );
  }
  transaction.update(application.ref, {
    capacityReleased: true,
    capacityHeld: false,
  });
};
