import { Tool } from "./types.js";

export const findCourseFilesTool: Tool = {
  name: "find-course-files",
  description: "Search files within a course",
  inputSchema: {
    type: "object",
    properties: {
      courseId: { type: "string", description: "The ID of the course" },
      searchTerm: { type: "string", description: "Term to search for in file names" }
    },
    required: ["courseId", "searchTerm"],
  },
  execute: async (args: { courseId: string; searchTerm: string }, { studentTools }) => {
    return studentTools.findCourseFiles(args);
  }
};
