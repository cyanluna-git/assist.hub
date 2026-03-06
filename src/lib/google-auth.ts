import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";

const TOKEN_PATH = path.join(process.cwd(), "..", "ops", "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "..", "ops", "credentials.json");

export function buildGoogleOAuthClient() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error("ops/credentials.json이 없습니다. Google API 연동 설정을 먼저 확인하세요.");
  }

  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error("ops/token.json이 없습니다. Google 연동을 위해 인증을 먼저 갱신하세요.");
  }

  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  client.setCredentials(token);
  return client;
}
