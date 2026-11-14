import { handleSessionRequest } from "../lib/projects-api.js";

export default function handler(request, response) {
  return handleSessionRequest(request, response);
}
