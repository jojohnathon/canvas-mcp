import { Tool } from "./types.js";

export const getCourseGradeTool: Tool = {
  name: "get-course-grade",
  description: "Fetch student's current overall grade in a specific course",
  inputSchema: {
    type: "object",
    properties: {
      courseId: { type: "string", description: "The ID of the course" }
    },
    required: ["courseId"],
  },
  execute: async (args: { courseId: string }, { studentTools }) => {
    return studentTools.getCourseGrade(args);
  }
};
