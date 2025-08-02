import { Tool } from "./types.js";

export const listAssignmentsTool: Tool = {
  name: "list-assignments",
  description: "Get a list of all assignments in a course with submission status for students",
  inputSchema: {
    type: "object",
    properties: {
      courseId: { type: "string", description: "The ID of the course" },
      studentId: { type: "string", description: "Optional: Get submission status for a specific student" },
      includeSubmissionHistory: { type: "boolean", description: "Whether to include submission history details", default: false }
    },
    required: ["courseId"],
  },
  execute: async ({ courseId, studentId, includeSubmissionHistory = false }, { axios }) => {
    let assignments: any[] = [];
    let page = 1;
    let hasMore = true;
    try {
      while (hasMore) {
        const response = await axios.get(`/api/v1/courses/${courseId}/assignments`, {
          params: {
            per_page: 100,
            page,
            include: studentId ? ['submission', 'submission_comments', 'submission_history'] : [],
            student_ids: studentId ? [studentId] : undefined,
            order_by: 'position',
          }
        });
        const pageAssignments = response.data;
        assignments.push(...pageAssignments);
        hasMore = pageAssignments.length === 100;
        page += 1;
      }
      const formattedAssignments = assignments
        .map(assignment => {
          const parts = [
            `Assignment: ${assignment.name}`,
            `ID: ${assignment.id}`,
            `Due Date: ${assignment.due_at || 'No due date'}`,
            `Points Possible: ${assignment.points_possible}`,
            `Status: ${assignment.published ? 'Published' : 'Unpublished'}`
          ];
          if (assignment.submission) {
            parts.push('Submission:');
            parts.push(`  Status: ${assignment.submission.workflow_state}`);
            parts.push(`  Submitted: ${assignment.submission.submitted_at || 'Not submitted'}`);
            if (assignment.submission.score !== undefined) {
              parts.push(`  Score: ${assignment.submission.score}`);
            }
            if (assignment.submission.submission_comments?.length > 0) {
              parts.push('  Teacher Comments:');
              assignment.submission.submission_comments
                .filter((comment: any) => comment.author?.role === 'teacher')
                .forEach((comment: any) => {
                  const date = new Date(comment.created_at).toLocaleString();
                  parts.push(`    [${date}] ${comment.comment}`);
                });
            } else {
              parts.push('  Teacher Comments: None');
            }
            if (includeSubmissionHistory && assignment.submission.versioned_submissions?.length > 0) {
              parts.push('  Submission History:');
              assignment.submission.versioned_submissions
                .sort((a: any, b: any) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())
                .forEach((version: any, index: number) => {
                  const date = new Date(version.submitted_at).toLocaleString();
                  parts.push(`    Attempt ${index + 1} [${date}]:`);
                  if (version.score !== undefined) {
                    parts.push(`      Score: ${version.score}`);
                  }
                  if (version.grade) {
                    parts.push(`      Grade: ${version.grade}`);
                  }
                  if (version.submission_type) {
                    parts.push(`      Type: ${version.submission_type}`);
                  }
                });
            }
          } else {
            parts.push('Submission: No submission data available');
          }
          return parts.join('\n');
        })
        .join('\n---\n');
      return {
        content: [{
          type: "text",
          text: assignments.length > 0
            ? `Assignments in course ${courseId}:\n\n${formattedAssignments}\n\nTotal assignments: ${assignments.length}`
            : "No assignments found in this course.",
        }],
      };
    } catch (error: any) {
      console.error('Full error details:', error.response?.data || error);
      if (error.response?.data?.errors) {
        throw new Error(`Failed to fetch assignments: ${JSON.stringify(error.response.data.errors)}`);
      }
      if (error instanceof Error) {
        throw new Error(`Failed to fetch assignments: ${error.message}`);
      }
      throw new Error('Failed to fetch assignments: Unknown error');
    }
  }
};
