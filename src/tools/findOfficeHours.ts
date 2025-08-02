import { Tool } from "./types.js";

export const findOfficeHoursTool: Tool = {
  name: "find-office-hours-info",
  description: "Search common locations within a course for instructor office hours information (e.g., syllabus, announcements).",
  inputSchema: {
    type: "object",
    properties: {
      courseId: { type: "string", description: "The ID of the course to search within." }
    },
    required: ["courseId"],
  },
  execute: async (args: { courseId: string }, { studentTools }) => {
    try {
      console.error(`Executing find-office-hours-info for course ${args.courseId}`);
      const results = await studentTools.findOfficeHoursInfo(args);
      console.error(`find-office-hours-info result: ${JSON.stringify(results).substring(0, 200)}...`);
      return results;
    } catch (error: any) {
      console.error(`Error in findOfficeHoursTool: ${error.message}`);
      return {
        error: {
          code: -32001,
          message: `Tool execution failed for find-office-hours-info: ${error.message}`
        }
      };
    }
  }
};
