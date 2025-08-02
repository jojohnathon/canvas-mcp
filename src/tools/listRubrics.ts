import { Tool } from "./types.js";
import { Rubric } from "../types.js";

export const listRubricsTool: Tool = {
  name: "list-rubrics",
  description: "List all rubrics for a specific course",
  inputSchema: {
    type: "object",
    properties: {
      courseId: { type: "string", description: "The ID of the course" }
    },
    required: ["courseId"],
  },
  execute: async ({ courseId }, { axios }) => {
    try {
      const response = await axios.get(`/api/v1/courses/${courseId}/rubrics`);
      const rubrics: Rubric[] = response.data;
      const formattedRubrics = rubrics.map((rubric: Rubric) =>
        `Rubric: ${rubric.title}\nID: ${rubric.id}\nDescription: ${rubric.description || 'No description'}\n---`
      ).join('\n');
      return {
        content: [{
          type: "text",
          text: formattedRubrics || "No rubrics found for this course",
        }],
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch rubrics: ${error.message}`);
      }
      throw new Error('Failed to fetch rubrics: Unknown error');
    }
  }
};
