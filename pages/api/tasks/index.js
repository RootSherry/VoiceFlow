const { listTasks } = require("../../../server/db/tasks");
const { getRecording } = require("../../../server/db/recordings");

module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const tasks = listTasks().map((t) => {
    const rec = getRecording(t.recordingId);
    return {
      id: t.id,
      recordingId: t.recordingId,
      title: rec?.title || "未知资产",
      type: t.type,
      status: t.status,
      error: t.error,
      updatedAt: t.updatedAt
    };
  });

  res.status(200).json({ tasks });
};

