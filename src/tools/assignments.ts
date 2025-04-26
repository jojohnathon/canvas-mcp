import { AxiosInstance } from 'axios';
import { Assignment } from '../types.js';
import { fetchAllPages } from '../utils.js'; // Import helper

/**
 * Fetch upcoming assignments across all active courses
 */
export async function getUpcomingAssignments(axiosInstance: AxiosInstance) {
  try {
    // First get all active courses
    const coursesResponse = await axiosInstance.get('/api/v1/courses', {
      params: {
        enrollment_state: 'active',
        per_page: 100
      }
    });

    const courses = coursesResponse.data;

    // For each course, get upcoming assignments
    const assignmentPromises = courses.map(async (course: any) => {
      try {
        const assignmentsResponse = await axiosInstance.get(
          `/api/v1/courses/${course.id}/assignments`, {
            params: {
              bucket: 'upcoming',
              include: ['submission'],
              per_page: 50
            }
          }
        );

        return assignmentsResponse.data.map((assignment: any) => ({
          ...assignment,
          course_name: course.name
        }));
      } catch (error) {
        console.error(`Error fetching assignments for course ${course.id}:`, error);
        return [];
      }
    });

    const assignmentsArrays = await Promise.all(assignmentPromises);
    const assignments: Assignment[] = assignmentsArrays.flat();

    // Sort by due date
    assignments.sort((a, b) => {
      if (!a.due_at) return 1;
      if (!b.due_at) return -1;
      return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
    });

    // Apply concise formatting
    const formattedAssignments = assignments.map(assignment => {
      const dueDate = assignment.due_at ? new Date(assignment.due_at).toLocaleDateString() : 'No due date';
      const points = assignment.points_possible !== null ? `Points: ${assignment.points_possible}` : 'No points';
      const submitted = assignment.submission?.submitted_at ? 'Submitted: Yes' : 'Submitted: No';
      // Concise format: "- Assignment Name (Course Name) - Due: DueDate [Points] (Submitted)"
      return `- ${assignment.name} (${assignment.course_name}) - Due: ${dueDate} [${points}] (${submitted})`;
    }).join('\n'); // Join with newline

    return {
      content: [
        {
          type: "text",
          text: assignments.length > 0
            ? `Upcoming Assignments:\n\n${formattedAssignments}`
            : "No upcoming assignments found.",
        },
      ],
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch upcoming assignments: ${error.message}`);
    }
    throw new Error('Failed to fetch upcoming assignments: Unknown error');
  }
}

/**
 * Fetch details for a specific assignment including submission status
 */
export async function getAssignmentDetails(axiosInstance: AxiosInstance, args: { courseId: string; assignmentId: string }) {
  const { courseId, assignmentId } = args;

  try {
    const response = await axiosInstance.get(
      `/api/v1/courses/${courseId}/assignments/${assignmentId}`, {
        params: {
          include: ['submission']
        }
      }
    );

    const assignment = response.data;
    const submission = assignment.submission;

    // Format the response for better readability
    const formattedAssignment = {
      id: assignment.id,
      name: assignment.name,
      description: assignment.description,
      due_at: assignment.due_at,
      points_possible: assignment.points_possible,
      submission_status: submission ? {
        submitted: !!submission.submitted_at,
        submitted_at: submission.submitted_at,
        late: submission.late,
        missing: submission.missing,
        score: submission.score,
        grade: submission.grade,
        feedback: submission.submission_comments?.map((comment: any) => ({
          author: comment.author_name,
          comment: comment.comment,
          created_at: comment.created_at
        }))
      } : null,
      html_url: assignment.html_url
    };

    return {
      content: [
        {
          type: "text",
          text: `Assignment Details:\n\nName: ${formattedAssignment.name}\nDue Date: ${formattedAssignment.due_at ? new Date(formattedAssignment.due_at).toLocaleString() : 'No due date'}\nPoints Possible: ${formattedAssignment.points_possible}\n\n${formattedAssignment.description ? `Description:\n${formattedAssignment.description.replace(/<[^>]*>/g, '')}\n\n` : ''}${formattedAssignment.submission_status ?
            `Submission Status:\nSubmitted: ${formattedAssignment.submission_status.submitted ? 'Yes' : 'No'}${formattedAssignment.submission_status.submitted_at ? `\nSubmission Date: ${new Date(formattedAssignment.submission_status.submitted_at).toLocaleString()}` : ''}${formattedAssignment.submission_status.late ? '\nStatus: Late' : ''}${formattedAssignment.submission_status.missing ? '\nStatus: Missing' : ''}\nScore: ${formattedAssignment.submission_status.score !== null ? formattedAssignment.submission_status.score : 'Not graded'}\nGrade: ${formattedAssignment.submission_status.grade || 'Not graded'}${formattedAssignment.submission_status.feedback && formattedAssignment.submission_status.feedback.length > 0 ?
              `\n\nFeedback:\n${formattedAssignment.submission_status.feedback.map((item: any) => `[${new Date(item.created_at).toLocaleString()}] ${item.author}: ${item.comment}`).join('\n')}` : ''}`
            : 'No submission information available.'}\n\nURL: ${formattedAssignment.html_url}`,
        },
      ],
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch assignment details: ${error.message}`);
    }
    throw new Error('Failed to fetch assignment details: Unknown error');
  }
}
