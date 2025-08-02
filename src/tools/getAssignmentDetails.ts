import { Tool } from "./types.js";

export const getAssignmentDetailsTool: Tool = {
  name: "get-assignment-details",
  description: "Fetch details for a specific assignment including student's submission status",
  inputSchema: {
    type: "object",
    properties: {
      courseId: { type: "string", description: "The ID of the course" },
      assignmentId: { type: "string", description: "The ID of the assignment" }
    },
    required: ["courseId", "assignmentId"],
  },
  execute: async (args: { courseId: string; assignmentId: string }, { studentTools }) => {
    return studentTools.getAssignmentDetails(args);
  }
};
