// filepath: c:\Users\pixel\Desktop\coding\canvas-mcp\src\tools\general.ts
import axios, { AxiosInstance } from 'axios';
import { Course, Rubric } from '../types.js'; // Adjust path as needed
import { delay, fetchAllPages } from '../utils.js'; // Adjust path as needed

// --- List Courses ---
export async function listCourses(axiosInstance: AxiosInstance) {
  const maxRetries = 2;
  const retryDelay = 1000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.error(`Attempt ${attempt + 1} to fetch courses...`);
      const response = await axiosInstance.get('/api/v1/courses', {
        params: {
          enrollment_state: 'active',
          state: ['available'],
          per_page: 100,
          include: ['term'],
        },
        timeout: 15000,
      });

      const courses: Course[] = response.data;

      const formattedCourses = courses
        .filter(course => course.workflow_state === 'available')
        .map((course: Course) => {
          const termInfo = course.term ? ` (${course.term.name})` : '';
          return `- ${course.name}${termInfo} [ID: ${course.id}]`;
        })
        .join('\n');

      return {
        content: [
          {
            type: "text",
            text: formattedCourses
              ? `Available Courses:\n\n${formattedCourses}`
              : "No active courses found.",
          },
        ],
      };
    } catch (error: unknown) {
      console.error(`Attempt ${attempt + 1} failed.`);

      if (axios.isAxiosError(error) && error.code === 'ECONNRESET') {
        console.error(`Axios ECONNRESET error fetching courses (Attempt ${attempt + 1}/${maxRetries + 1}): ${error.message}`);
        if (attempt < maxRetries) {
          console.error(`Retrying in ${retryDelay / 1000} second(s)...`);
          await delay(retryDelay);
          continue;
        } else {
          console.error("Max retries reached for ECONNRESET.");
        }
      } else {
        if (axios.isAxiosError(error)) {
          console.error(`Axios error fetching courses: ${error.message}`, error.code, error.config?.url);
        } else {
          console.error("Non-Axios error fetching courses:", error);
        }
        if (error instanceof Error) {
          throw new Error(`Failed to fetch courses: ${error.message}`);
        }
        throw new Error('Failed to fetch courses: Unknown error');
      }

      if (error instanceof Error) {
        throw new Error(`Failed to fetch courses after ${maxRetries + 1} attempts: ${error.message}`);
      }
      throw new Error(`Failed to fetch courses after ${maxRetries + 1} attempts: Unknown error`);
    }
  }
  throw new Error('listCourses exited loop unexpectedly.');
}

// --- List Rubrics ---
export async function listRubrics(axiosInstance: AxiosInstance, args: { courseId: string }) {
  const { courseId } = args;

  try {
    // Use fetchAllPages for potential pagination, although rubrics list might be short
    const rubrics: Rubric[] = await fetchAllPages(axiosInstance, `/api/v1/courses/${courseId}/rubrics`);

    const formattedRubrics = rubrics.map((rubric: Rubric) =>
      `Rubric: ${rubric.title}\nID: ${rubric.id}\nDescription: ${rubric.description || 'No description'}\n---`
    ).join('\n');

    return {
      content: [
        {
          type: "text",
          text: formattedRubrics || "No rubrics found for this course",
        },
      ],
    };
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new Error(`Course ${courseId} not found or rubrics unavailable.`);
    }
    if (error instanceof Error) {
      throw new Error(`Failed to fetch rubrics for course ${courseId}: ${error.message}`);
    }
    throw new Error(`Failed to fetch rubrics for course ${courseId}: Unknown error`);
  }
}

// --- List Assignments ---
export async function listAssignments(axiosInstance: AxiosInstance, args: { courseId: string; studentId?: string; includeSubmissionHistory?: boolean }) {
  const { courseId, studentId, includeSubmissionHistory = false } = args;

  try {
    const params: any = {
        per_page: 100,
        include: studentId ? ['submission', 'submission_comments', 'submission_history'] : [],
        order_by: 'position', // Keep default ordering
    };
    if (studentId) {
        params.student_ids = [studentId]; // Canvas expects an array even for one ID
    }

    const assignments: any[] = await fetchAllPages(axiosInstance, `/api/v1/courses/${courseId}/assignments`, params);

    const formattedAssignments = assignments
      .map(assignment => {
        const parts = [
          `Assignment: ${assignment.name}`,
          `ID: ${assignment.id}`,
          `Due Date: ${assignment.due_at || 'No due date'}`,
          `Points Possible: ${assignment.points_possible}`,
          `Status: ${assignment.published ? 'Published' : 'Unpublished'}`,
        ];

        if (assignment.submission) {
          parts.push('Submission:');
          parts.push(`  Status: ${assignment.submission.workflow_state}`);
          parts.push(`  Submitted: ${assignment.submission.submitted_at || 'Not submitted'}`);

          if (assignment.submission.score !== undefined && assignment.submission.score !== null) {
            parts.push(`  Score: ${assignment.submission.score}`);
          }
          if (assignment.submission.grade) {
             parts.push(`  Grade: ${assignment.submission.grade}`);
          }

          if (assignment.submission.submission_comments?.length > 0) {
            parts.push('  Teacher Comments:');
            assignment.submission.submission_comments
              .filter((comment: any) => comment.author?.role === 'teacher') // Assuming 'teacher' role exists
              .forEach((comment: any) => {
                const date = comment.created_at ? new Date(comment.created_at).toLocaleString() : 'Unknown date';
                parts.push(`    [${date}] ${comment.comment}`);
              });
            if (!parts[parts.length -1].startsWith('    [')) { // Add 'None' if no teacher comments were added
                 parts.push('    None');
            }
          } else {
            parts.push('  Teacher Comments: None');
          }

          if (includeSubmissionHistory && assignment.submission.submission_history?.length > 0) { // Use submission_history
            parts.push('  Submission History:');
            assignment.submission.submission_history // Use the correct field name
              .sort((a: any, b: any) => (a.submitted_at && b.submitted_at) ? new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime() : 0)
              .forEach((version: any, index: number) => {
                const date = version.submitted_at ? new Date(version.submitted_at).toLocaleString() : 'Unknown date';
                parts.push(`    Attempt ${index + 1} [${date}]:`);
                if (version.score !== undefined && version.score !== null) {
                  parts.push(`      Score: ${version.score}`);
                }
                if (version.grade) {
                  parts.push(`      Grade: ${version.grade}`);
                }
                if (version.submission_type) {
                  parts.push(`      Type: ${version.submission_type}`);
                }
                // Add more details if needed, e.g., version.body for text submissions
              });
          }
        } else if (studentId) { // Only mention lack of submission if studentId was provided
          parts.push('Submission: No submission data found for this student.');
        }

        return parts.join('\n');
      })
      .join('\n---\n');

    return {
      content: [
        {
          type: "text",
          text: assignments.length > 0
            ? `Assignments in course ${courseId}:\n\n${formattedAssignments}\n\nTotal assignments: ${assignments.length}`
            : `No assignments found in course ${courseId}.`,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error fetching assignments:', error.response?.data || error.message);
     if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new Error(`Course ${courseId} not found.`);
    }
    if (error.response?.data?.errors) {
      throw new Error(`Failed to fetch assignments for course ${courseId}: ${JSON.stringify(error.response.data.errors)}`);
    }
    if (error instanceof Error) {
      throw new Error(`Failed to fetch assignments for course ${courseId}: ${error.message}`);
    }
    throw new Error(`Failed to fetch assignments for course ${courseId}: Unknown error`);
  }
}


// --- List Sections ---
export async function listSections(axiosInstance: AxiosInstance, args: { courseId: string; includeStudentCount?: boolean }) {
  const { courseId, includeStudentCount = false } = args;

  try {
    const params: any = {
        per_page: 100,
        include: includeStudentCount ? ['total_students'] : [],
    };

    const sections: any[] = await fetchAllPages(axiosInstance, `/api/v1/courses/${courseId}/sections`, params);

    const formattedSections = sections
      .map(section => {
        const parts = [
          `Name: ${section.name}`,
          `ID: ${section.id}`,
          `SIS ID: ${section.sis_section_id || 'N/A'}`,
        ];

        if (section.start_at) {
          parts.push(`Start Date: ${new Date(section.start_at).toLocaleDateString()}`);
        }
        if (section.end_at) {
          parts.push(`End Date: ${new Date(section.end_at).toLocaleDateString()}`);
        }

        if (includeStudentCount && section.total_students !== undefined && section.total_students !== null) { // Check existence
          parts.push(`Total Students: ${section.total_students}`);
        } else if (includeStudentCount) {
           parts.push(`Total Students: Data unavailable`); // Indicate if requested but not present
        }


        if (section.restrict_enrollments_to_section_dates) {
          parts.push('Restricted to Section Dates: Yes');
        }

        return parts.join('\n');
      })
      .join('\n---\n');

    return {
      content: [
        {
          type: "text",
          text: sections.length > 0
            ? `Sections in course ${courseId}:\n\n${formattedSections}\n\nTotal sections: ${sections.length}`
            : `No sections found in course ${courseId}.`,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error fetching sections:', error.response?.data || error.message);
    if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new Error(`Course ${courseId} not found.`);
    }
    if (error.response?.data?.errors) {
      throw new Error(`Failed to fetch sections for course ${courseId}: ${JSON.stringify(error.response.data.errors)}`);
    }
    if (error instanceof Error) {
      throw new Error(`Failed to fetch sections for course ${courseId}: ${error.message}`);
    }
    throw new Error(`Failed to fetch sections for course ${courseId}: Unknown error`);
  }
}
