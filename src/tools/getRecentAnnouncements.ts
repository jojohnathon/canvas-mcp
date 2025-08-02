import { Tool } from "./types.js";

export const getRecentAnnouncementsTool: Tool = {
  name: "get-recent-announcements",
  description: "Fetch recent announcements from all active courses",
  inputSchema: {
    type: "object",
    properties: {
      days: { type: "number", description: "Number of days to look back (default: 14)", default: 14 },
      courseId: { type: "string", description: "Optional course ID to filter", required: false }
    },
    required: [],
  },
  execute: async (args: { days?: number; courseId?: string }, { studentTools }) => {
    return studentTools.getRecentAnnouncements(args);
  }
};
