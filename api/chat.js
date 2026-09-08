import { Octokit } from "@octokit/rest";

const octokit = new Octokit({ auth: process.env.MY_GITHUB_TOKEN });
const OWNER = "USBOSS1163";
const REPO = "basic-electricityGGGGG";
const FILE_PATH = "chat_history.json";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Cache-Control, Pragma, Authorization");
  res.setHeader("Cache-Control", "no-cache, no-store, max-age=0, must-revalidate, s-maxage=0");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    if (req.method === "GET") {
      try {
        const { data } = await octokit.repos.getContent({
          owner: OWNER,
          repo: REPO,
          path: FILE_PATH,
          headers: { "If-None-Match": "", "Cache-Control": "no-cache" }
        });
        const content = Buffer.from(data.content, "base64").toString("utf-8");
        return res.status(200).json({ success: true, sha: data.sha, data: JSON.parse(content) });
      } catch (e) {
        return res.status(200).json({ success: true, sha: "", data: { messages: [] } });
      }
    }

    if (req.method === "POST") {
      let bodyData = req.body;
      if (typeof bodyData === "string") {
        try { bodyData = JSON.parse(bodyData); } catch (e) {}
      }

      const { newMsg, overrideMessages } = bodyData || {};
      let currentContent = { messages: [] };
      let latestSha = "";

      try {
        const { data } = await octokit.repos.getContent({
          owner: OWNER,
          repo: REPO,
          path: FILE_PATH,
          headers: { "If-None-Match": "", "Cache-Control": "no-cache" }
        });
        currentContent = JSON.parse(Buffer.from(data.content, "base64").toString("utf-8"));
        latestSha = data.sha;
      } catch (err) {
        console.warn("未找到現有檔案，將建立新檔案");
      }

      let actionType = "UNKNOWN";

      if (overrideMessages && Array.isArray(overrideMessages)) {
        currentContent.messages = overrideMessages;
        actionType = "DELETE_OVERRIDE";
      } else if (newMsg) {
        if (!Array.isArray(currentContent.messages)) currentContent.messages = [];
        currentContent.messages.push(newMsg);
        if (currentContent.messages.length > 50) {
          currentContent.messages = currentContent.messages.slice(-50);
        }
        actionType = "ADD_NEW";
      } else {
        return res.status(400).json({ success: false, error: "無效的請求內容" });
      }

      // 修正重點：把 JSON 字串明確轉為 UTF-8 Buffer 後再轉為 Base64
      const jsonString = JSON.stringify(currentContent, null, 2);
      const base64Content = Buffer.from(jsonString, "utf-8").toString("base64");

      const updateResult = await octokit.repos.createOrUpdateFileContents({
        owner: OWNER,
        repo: REPO,
        path: FILE_PATH,
        message: `[API Action] ${actionType} at ${new Date().toISOString()}`,
        content: base64Content,
        sha: latestSha || undefined
      });

      return res.status(200).json({ 
        success: true, 
        action: actionType,
        newSha: updateResult.data.content.sha,
        updatedCount: currentContent.messages.length,
        messages: currentContent.messages 
      });
    }

    return res.status(405).json({ error: "Method Not Allowed" });

  } catch (error) {
    return res.status(500).json({ 
      success: false,
      error: error.message || "伺服器寫入失敗"
    });
  }
}