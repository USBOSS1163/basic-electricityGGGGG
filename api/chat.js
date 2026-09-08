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
      // 確保 body 能夠被正確解析
      let bodyData = req.body;
      if (typeof bodyData === "string") {
        try { bodyData = JSON.parse(bodyData); } catch (e) {}
      }

      const { newMsg, overrideMessages } = bodyData || {};
      let currentContent = { messages: [] };
      let latestSha = "";

      // 抓取 GitHub 最新 SHA
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
        // 刪除邏輯：直接用過濾後的陣列取代原本陣列
        currentContent.messages = overrideMessages;
        actionType = "DELETE_OVERRIDE";
      } else if (newMsg) {
        // 新增邏輯
        if (!Array.isArray(currentContent.messages)) currentContent.messages = [];
        currentContent.messages.push(newMsg);
        if (currentContent.messages.length > 50) {
          currentContent.messages = currentContent.messages.slice(-50);
        }
        actionType = "ADD_NEW";
      } else {
        return res.status(400).json({ success: false, error: "無效的請求內容 (body 缺少 newMsg 或 overrideMessages)" });
      }

      // 寫入 GitHub
      const updateResult = await octokit.repos.createOrUpdateFileContents({
        owner: OWNER,
        repo: REPO,
        path: FILE_PATH,
        message: `[API Action] ${actionType} at ${new Date().toISOString()}`,
        content: Buffer.from(JSON.stringify(currentContent, null, 2)).toString("utf-8"),
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