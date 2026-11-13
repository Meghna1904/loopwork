import { handleProjectsRequest } from "../lib/projects-api.js";

export default function handler(request, response) {
  return handleProjectsRequest(request, response);
}
