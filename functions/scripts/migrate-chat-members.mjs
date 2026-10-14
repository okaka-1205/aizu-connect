import process from "node:process";
import {initializeApp} from "firebase-admin/app";
import {FieldPath, FieldValue, getFirestore} from "firebase-admin/firestore";

const args = new Set(process.argv.slice(2));
const readArgument = (prefix) =>
  [...args].find((argument) => argument.startsWith(`${prefix}=`))?.slice(
    prefix.length + 1,
  );

const projectId = readArgument("--project") ?? process.env.GCLOUD_PROJECT;
const applyChanges = args.has("--apply");
const confirmation = readArgument("--confirm");
const pageSize = Math.min(
  250,
  Math.max(1, Number(readArgument("--page-size") ?? 100)),
);

if (!projectId) {
  throw new Error("--project=<project-id> is required.");
}
if (applyChanges && confirmation !== projectId) {
  throw new Error(
    `Production writes require --confirm=${projectId}. Run without --apply first.`,
  );
}

initializeApp({projectId});
const db = getFirestore();

const stats = {
  roomsScanned: 0,
  roomsWithLegacyParticipants: 0,
  existingMembers: 0,
  missingMembers: 0,
  invalidParticipantIds: 0,
  memberWrites: 0,
  roomCountUpdates: 0,
};

const chunks = (values, size) => {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
};

const loadSnapshots = async (references) => {
  const snapshots = [];
  for (const referenceChunk of chunks(references, 200)) {
    snapshots.push(...(await db.getAll(...referenceChunk)));
  }
  return snapshots;
};

let cursor;
const pendingWrites = [];
const roomsToUpdate = [];

while (true) {
  let roomQuery = db
    .collection("chatRooms")
    .orderBy(FieldPath.documentId())
    .limit(pageSize);
  if (cursor) roomQuery = roomQuery.startAfter(cursor);
  const roomSnapshot = await roomQuery.get();
  if (roomSnapshot.empty) break;

  stats.roomsScanned += roomSnapshot.size;
  const candidates = [];
  const userIds = new Set();
  for (const room of roomSnapshot.docs) {
    const data = room.data();
    const rawIds = [
      ...(Array.isArray(data.participantIds) ? data.participantIds : []),
      data.organizationId,
      data.studentId,
    ];
    const participantIds = [...new Set(rawIds.filter((value) => {
      const valid = typeof value === "string" && value.trim().length > 0;
      if (!valid && value !== undefined && value !== "") {
        stats.invalidParticipantIds += 1;
      }
      return valid;
    }))];
    if (participantIds.length === 0) continue;
    stats.roomsWithLegacyParticipants += 1;
    participantIds.forEach((userId) => {
      userIds.add(userId);
      candidates.push({room, data, userId});
    });
  }

  const userRefs = [...userIds].map((userId) => db.doc(`users/${userId}`));
  const userSnapshots = await loadSnapshots(userRefs);
  const users = new Map(
    userSnapshots
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => [snapshot.id, snapshot.data()]),
  );
  const memberRefs = candidates.map(({room, userId}) =>
    room.ref.collection("members").doc(userId),
  );
  const memberSnapshots = await loadSnapshots(memberRefs);
  const existingPaths = new Set(
    memberSnapshots
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => snapshot.ref.path),
  );
  stats.existingMembers += existingPaths.size;

  const memberCounts = new Map();
  candidates.forEach(({room}) => {
    memberCounts.set(room.id, (memberCounts.get(room.id) ?? 0) + 1);
  });
  roomSnapshot.docs.forEach((room) => {
    const memberCount = memberCounts.get(room.id);
    if (memberCount !== undefined && room.data().memberCount !== memberCount) {
      roomsToUpdate.push({reference: room.ref, memberCount});
    }
  });

  candidates.forEach(({data, userId}, index) => {
    const memberRef = memberRefs[index];
    if (existingPaths.has(memberRef.path)) return;
    const user = users.get(userId);
    const isOrganization =
      userId === data.organizationId || user?.role === "organization";
    pendingWrites.push({
      reference: memberRef,
      data: {
        userId,
        role: isOrganization ? "organization" : "student",
        displayName:
          user?.displayName ??
          (isOrganization ? data.organizationName : data.studentName) ??
          "参加者",
        joinedAt: data.createdAt ?? FieldValue.serverTimestamp(),
      },
    });
  });

  cursor = roomSnapshot.docs[roomSnapshot.docs.length - 1];
}

stats.missingMembers = pendingWrites.length;
if (applyChanges) {
  const writer = db.bulkWriter();
  writer.onWriteError((error) => error.failedAttempts < 3);
  await Promise.all([
    ...pendingWrites.map(({reference, data}) =>
      writer.set(reference, data, {merge: false}).then(() => {
        stats.memberWrites += 1;
      }),
    ),
    ...roomsToUpdate.map(({reference, memberCount}) =>
      writer.set(reference, {memberCount}, {merge: true}).then(() => {
        stats.roomCountUpdates += 1;
      }),
    ),
  ]);
  await writer.close();
  await db.collection("adminOperations").add({
    type: "chat_members_migration",
    projectId,
    stats,
    completedAt: FieldValue.serverTimestamp(),
  });
}

console.log(JSON.stringify({mode: applyChanges ? "apply" : "dry-run", ...stats}));
