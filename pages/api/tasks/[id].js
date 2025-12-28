const { getTask } = require("../../../server/db/tasks");

module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const id = String(req.query.id || "");
  const task = getTask(id);
  if (!task) {
    res.status(404).json({ error: "Not Found" });
    return;
  }

  res.status(200).json({ task });
};

