import { Tool } from "./types.js";

export const getUpcomingAssignmentsTool: Tool = {
  name: "get-upcoming-assignments",
  description: "Fetch upcoming assignments across all active courses for the student",
  inputSchema: { type: "object", properties: {}, required: [] },
  execute: async (_args, { studentTools }) => {
    return studentTools.getUpcomingAssignments();
  }
};
