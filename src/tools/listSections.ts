import { Tool } from "./types.js";

export const listSectionsTool: Tool = {
  name: "list-sections",
  description: "Get a list of all sections in a course",
  inputSchema: {
    type: "object",
    properties: {
      courseId: { type: "string", description: "The ID of the course" },
      includeStudentCount: { type: "boolean", description: "Whether to include the number of students in each section", default: false }
    },
    required: ["courseId"],
  },
  execute: async ({ courseId, includeStudentCount = false }, { axios }) => {
    let sections: any[] = [];
    let page = 1;
    let hasMore = true;
    try {
      while (hasMore) {
        const response = await axios.get(`/api/v1/courses/${courseId}/sections`, {
          params: {
            per_page: 100,
            page,
            include: includeStudentCount ? ['total_students'] : []
          }
        });
        const pageSections = response.data;
        sections.push(...pageSections);
        hasMore = pageSections.length === 100;
        page += 1;
      }
      const formattedSections = sections
        .map(section => {
          const parts = [
            `Name: ${section.name}`,
            `ID: ${section.id}`,
            `SIS ID: ${section.sis_section_id || 'N/A'}`
          ];
          if (section.start_at) {
            parts.push(`Start Date: ${new Date(section.start_at).toLocaleDateString()}`);
          }
          if (section.end_at) {
            parts.push(`End Date: ${new Date(section.end_at).toLocaleDateString()}`);
          }
          if (includeStudentCount) {
            parts.push(`Total Students: ${section.total_students || 0}`);
          }
          if (section.restrict_enrollments_to_section_dates) {
            parts.push('Restricted to Section Dates: Yes');
          }
          return parts.join('\n');
        })
        .join('\n---\n');
      return {
        content: [{
          type: "text",
          text: sections.length > 0
            ? `Sections in course ${courseId}:\n\n${formattedSections}\n\nTotal sections: ${sections.length}`
            : "No sections found in this course.",
        }],
      };
    } catch (error: any) {
      console.error('Full error details:', error.response?.data || error);
      if (error.response?.status === 404) {
        throw new Error(`Course ${courseId} not found`);
      }
      if (error.response?.data?.errors) {
        throw new Error(`Failed to fetch sections: ${JSON.stringify(error.response.data.errors)}`);
      }
      if (error instanceof Error) {
        throw new Error(`Failed to fetch sections: ${error.message}`);
      }
      throw new Error('Failed to fetch sections: Unknown error');
    }
  }
};
