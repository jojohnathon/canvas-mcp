import axios, { AxiosInstance } from 'axios';

// Interfaces for tool input/output types
interface TodoItem {
  type: string;
  assignment?: {
    id: string;
    name: string;
    due_at: string;
    points_possible: number;
    course_id: string;
  };
  context_name: string;
  course_id?: string;
  html_url: string;
  ignore_url?: string;
  title?: string;
}

interface Assignment {
  id: string;
  name: string;
  description: string;
  due_at: string | null;
  points_possible: number;
  submission?: {
    submitted_at: string | null;
    score: number | null;
    grade: string | null;
    late: boolean;
    missing: boolean;
  };
  html_url: string;
  course_id: string;
  course_name?: string;
}

interface CourseGrade {
  course_id: string;
  course_name: string;
  current_grade: string | null;
  current_score: number | null;
  final_grade: string | null;
  final_score: number | null;
  html_url: string;
}

interface Announcement {
  id: string;
  title: string;
  message: string;
  posted_at: string;
  course_id: string;
  course_name: string;
  html_url: string;
}

interface Module {
  id: string;
  name: string;
  position: number;
  items: ModuleItem[];
  state?: string;
  completed?: boolean;
}

interface ModuleItem {
  id: string;
  title: string;
  type: string;
  content_id: string;
  html_url: string;
  position: number;
  completion_requirement?: {
    type: string;
    completed: boolean;
  };
}

interface CourseFile {
  id: string;
  display_name: string;
  size: number;
  created_at: string;
  updated_at: string;
  content_type: string;
  url: string;
  thumbnail_url?: string;
}

interface DiscussionTopic {
  id: string;
  title: string;
  message: string;
  posted_at: string;
  author_name?: string;
  unread_count?: number;
  html_url: string;
  course_id?: string;
}

interface DiscussionEntry {
  id: string;
  user_name: string;
  message: string;
  created_at: string;
  updated_at: string;
  replies?: DiscussionEntry[];
}

interface QuizSubmission {
  id: string;
  quiz_id: string;
  user_id: string;
  submission_id: string;
  started_at: string;
  finished_at: string | null;
  end_at: string | null;
  score: number | null;
  kept_score: number | null;
  time_spent: number;
  attempt: number;
  workflow_state: string;
  html_url: string;
}

// Main class for handling student tools
export class StudentTools {
  private axiosInstance: AxiosInstance;

  constructor(baseUrl: string, apiToken: string) {
    this.axiosInstance = axios.create({
      baseURL: baseUrl,
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    });
  }

  /**
   * Fetch the student's to-do list
   */
  async getMyTodoItems() {
    try {
      const response = await this.axiosInstance.get('/api/v1/users/self/todo');
      const todoItems: TodoItem[] = response.data;
      
      // Format the response for better readability in LLM context
      const formattedResult = todoItems.map(item => {
        let title = item.title || (item.assignment ? item.assignment.name : 'Untitled Item');
        let dueDate = item.assignment?.due_at ? new Date(item.assignment.due_at).toLocaleString() : 'No due date';
        
        return {
          title,
          type: item.type,
          course_name: item.context_name,
          due_date: dueDate,
          points_possible: item.assignment?.points_possible || null,
          url: item.html_url
        };
      });

      return {
        content: [
          {
            type: "text",
            text: todoItems.length > 0 
              ? `To-Do Items:\n\n${formattedResult.map(item => 
                `Title: ${item.title}\nType: ${item.type}\nCourse: ${item.course_name}\nDue Date: ${item.due_date}${item.points_possible ? `\nPoints: ${item.points_possible}` : ''}\nURL: ${item.url}\n---`
              ).join('\n')}`
              : "No to-do items found.",
          },
        ],
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch to-do items: ${error.message}`);
      }
      throw new Error('Failed to fetch to-do items: Unknown error');
    }
  }

  /**
   * Fetch upcoming assignments across all active courses
   */
  async getUpcomingAssignments() {
    try {
      // First get all active courses
      const coursesResponse = await this.axiosInstance.get('/api/v1/courses', {
        params: {
          enrollment_state: 'active',
          per_page: 100
        }
      });
      
      const courses = coursesResponse.data;
      
      // For each course, get upcoming assignments
      const assignmentPromises = courses.map(async (course: any) => {
        try {
          const assignmentsResponse = await this.axiosInstance.get(
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

      return {
        content: [
          {
            type: "text",
            text: assignments.length > 0 
              ? `Upcoming Assignments:\n\n${assignments.map(assignment => 
                `Assignment: ${assignment.name}\nCourse: ${assignment.course_name}\nDue Date: ${assignment.due_at ? new Date(assignment.due_at).toLocaleString() : 'No due date'}\nPoints: ${assignment.points_possible}\n${assignment.submission ? `Submitted: ${assignment.submission.submitted_at ? 'Yes' : 'No'}\nScore: ${assignment.submission.score !== null ? assignment.submission.score : 'Not graded'}` : 'No submission information'}\nURL: ${assignment.html_url}\n---`
              ).join('\n')}`
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
   * Fetch student's current grade in a specific course
   */
  async getCourseGrade(args: { courseId: string }) {
    const { courseId } = args;
    
    try {
      // Get course information
      const courseResponse = await this.axiosInstance.get(`/api/v1/courses/${courseId}`);
      const course = courseResponse.data;
      
      // Get enrollment information (which includes grades)
      const enrollmentResponse = await this.axiosInstance.get(
        `/api/v1/courses/${courseId}/enrollments`, {
          params: {
            user_id: 'self'
          }
        }
      );
      
      // Find the student enrollment
      const studentEnrollment = enrollmentResponse.data.find((enrollment: any) => 
        enrollment.type === 'student' || enrollment.role === 'StudentEnrollment'
      );
      
      if (!studentEnrollment) {
        return {
          content: [
            {
              type: "text",
              text: `No student enrollment found for course ${course.name} (ID: ${courseId}).`,
            },
          ],
        };
      }
      
      const gradeInfo: CourseGrade = {
        course_id: courseId,
        course_name: course.name,
        current_grade: studentEnrollment.current_grade,
        current_score: studentEnrollment.current_score,
        final_grade: studentEnrollment.final_grade,
        final_score: studentEnrollment.final_score,
        html_url: `${this.axiosInstance.defaults.baseURL}/courses/${courseId}/grades`
      };

      return {
        content: [
          {
            type: "text",
            text: `Grade Information for ${gradeInfo.course_name}:\n\nCurrent Grade: ${gradeInfo.current_grade || 'Not Available'}\nCurrent Score: ${gradeInfo.current_score !== null ? gradeInfo.current_score : 'Not Available'}\nFinal Grade: ${gradeInfo.final_grade || 'Not Available'}\nFinal Score: ${gradeInfo.final_score !== null ? gradeInfo.final_score : 'Not Available'}\nGrades URL: ${gradeInfo.html_url}`,
          },
        ],
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch course grade: ${error.message}`);
      }
      throw new Error('Failed to fetch course grade: Unknown error');
    }
  }

  /**
   * Fetch details for a specific assignment including submission status
   */
  async getAssignmentDetails(args: { courseId: string; assignmentId: string }) {
    const { courseId, assignmentId } = args;
    
    try {
      const response = await this.axiosInstance.get(
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

  /**
   * Fetch recent announcements from all active courses
   */
  async getRecentAnnouncements(args: { days?: number } = {}) {
    const { days = 14 } = args; // Default to 14 days if not specified
    
    try {
      // First get all active courses
      const coursesResponse = await this.axiosInstance.get('/api/v1/courses', {
        params: {
          enrollment_state: 'active',
          per_page: 100
        }
      });
      
      const courses = coursesResponse.data;
      const courseIds = courses.map((course: any) => course.id);
      
      // Build context codes for the announcements API
      const contextCodes = courseIds.map((id: string) => `course_${id}`);
      
      // Get announcements for all courses at once
      const announcementsResponse = await this.axiosInstance.get('/api/v1/announcements', {
        params: {
          context_codes: contextCodes,
          start_date: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
          per_page: 50
        }
      });
      
      const announcements = announcementsResponse.data;
      
      // Add course names to the announcements
      const coursesMap = new Map(courses.map((course: any) => [course.id, course.name]));
      const formattedAnnouncements: Announcement[] = announcements.map((announcement: any) => {
        const courseId = announcement.context_code.replace('course_', '');
        return {
          id: announcement.id,
          title: announcement.title,
          message: announcement.message,
          posted_at: announcement.posted_at,
          course_id: courseId,
          course_name: coursesMap.get(courseId) || 'Unknown Course',
          html_url: announcement.html_url
        };
      });
      
      // Sort by posted date (newest first)
      formattedAnnouncements.sort((a, b) => 
        new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime()
      );

      return {
        content: [
          {
            type: "text",
            text: formattedAnnouncements.length > 0 
              ? `Recent Announcements (Last ${days} days):\n\n${formattedAnnouncements.map(announcement => 
                `Title: ${announcement.title}\nCourse: ${announcement.course_name}\nPosted: ${new Date(announcement.posted_at).toLocaleString()}\n\n${announcement.message.replace(/<[^>]*>/g, '')}\n\nURL: ${announcement.html_url}\n---`
              ).join('\n')}`
              : `No announcements found in the last ${days} days.`,
          },
        ],
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch recent announcements: ${error.message}`);
      }
      throw new Error('Failed to fetch recent announcements: Unknown error');
    }
  }

  /**
   * List modules and items for a course, with student completion status
   */
  async listCourseModules(args: { courseId: string }) {
    const { courseId } = args;
    
    try {
      const response = await this.axiosInstance.get(
        `/api/v1/courses/${courseId}/modules`, {
          params: {
            include: ['items', 'content_details'],
            student_id: 'self',
            per_page: 100
          }
        }
      );
      
      const modules: Module[] = response.data;
      
      // Format the response for better readability
      const formattedModules = modules.map(module => ({
        id: module.id,
        name: module.name,
        position: module.position,
        state: module.state,
        completed: module.state === 'completed',
        items: module.items?.map(item => ({
          id: item.id,
          title: item.title,
          type: item.type,
          url: item.html_url,
          position: item.position,
          completed: item.completion_requirement?.completed || false,
          requirement_type: item.completion_requirement?.type || 'none'
        })) || []
      }));
      
      // Sort modules by position
      formattedModules.sort((a, b) => a.position - b.position);
      
      // Sort items within each module by position
      formattedModules.forEach(module => {
        module.items.sort((a, b) => a.position - b.position);
      });

      return {
        content: [
          {
            type: "text",
            text: formattedModules.length > 0 
              ? `Course Modules:\n\n${formattedModules.map(module => 
                `Module: ${module.name}${module.completed ? ' (Completed)' : ''}\n${module.items.length > 0 ? 
                  `Items:\n${module.items.map(item => 
                    `  - ${item.title} (${item.type})${item.completed ? ' ✓' : ''}${item.requirement_type !== 'none' ? ` [${item.requirement_type}]` : ''}`
                  ).join('\n')}` 
                  : 'No items'}\n---`
              ).join('\n')}`
              : "No modules found for this course.",
          },
        ],
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch course modules: ${error.message}`);
      }
      throw new Error('Failed to fetch course modules: Unknown error');
    }
  }

  /**
   * Search files within a course
   */
  async findCourseFiles(args: { courseId: string; searchTerm: string }) {
    const { courseId, searchTerm } = args;
    
    try {
      const response = await this.axiosInstance.get(
        `/api/v1/courses/${courseId}/files`, {
          params: {
            search_term: searchTerm,
            per_page: 50
          }
        }
      );
      
      const files: CourseFile[] = response.data;
      
      // Format the response for better readability
      const formattedFiles = files.map(file => ({
        id: file.id,
        name: file.display_name,
        size: this.formatFileSize(file.size),
        type: file.content_type,
        created: new Date(file.created_at).toLocaleString(),
        updated: new Date(file.updated_at).toLocaleString(),
        url: file.url
      }));

      return {
        content: [
          {
            type: "text",
            text: formattedFiles.length > 0 
              ? `Files matching "${searchTerm}":\n\n${formattedFiles.map(file => 
                `Name: ${file.name}\nType: ${file.type}\nSize: ${file.size}\nCreated: ${file.created}\nUpdated: ${file.updated}\nURL: ${file.url}\n---`
              ).join('\n')}`
              : `No files found matching "${searchTerm}" in this course.`,
          },
        ],
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to search course files: ${error.message}`);
      }
      throw new Error('Failed to search course files: Unknown error');
    }
  }

  /**
   * List unread discussion topics for a course
   */
  async getUnreadDiscussions(args: { courseId: string }) {
    const { courseId } = args;
    
    try {
      const response = await this.axiosInstance.get(
        `/api/v1/courses/${courseId}/discussion_topics`, {
          params: {
            filter_by: 'unread',
            per_page: 50
          }
        }
      );
      
      const discussions: DiscussionTopic[] = response.data;
      
      // Format the response for better readability
      const formattedDiscussions = discussions.map(discussion => ({
        id: discussion.id,
        title: discussion.title,
        message: discussion.message?.replace(/<[^>]*>/g, '') || 'No message',
        author: discussion.author_name || 'Unknown',
        posted_at: discussion.posted_at ? new Date(discussion.posted_at).toLocaleString() : 'Unknown',
        unread_count: discussion.unread_count || 0,
        url: discussion.html_url
      }));

      return {
        content: [
          {
            type: "text",
            text: formattedDiscussions.length > 0 
              ? `Unread Discussions:\n\n${formattedDiscussions.map(discussion => 
                `Title: ${discussion.title}\nAuthor: ${discussion.author}\nPosted: ${discussion.posted_at}\nUnread Replies: ${discussion.unread_count}\n\n${discussion.message.length > 200 ? `${discussion.message.substring(0, 200)}...` : discussion.message}\n\nURL: ${discussion.url}\n---`
              ).join('\n')}`
              : "No unread discussions found for this course.",
          },
        ],
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch unread discussions: ${error.message}`);
      }
      throw new Error('Failed to fetch unread discussions: Unknown error');
    }
  }

  /**
   * Retrieve posts/replies for a discussion topic
   */
  async viewDiscussionTopic(args: { courseId: string; topicId: string }) {
    const { courseId, topicId } = args;
    
    try {
      const response = await this.axiosInstance.get(
        `/api/v1/courses/${courseId}/discussion_topics/${topicId}/view`
      );
      
      const data = response.data;
      const topic = data.topic as DiscussionTopic;
      const entries = data.view as DiscussionEntry[];
      
      // Format the topic and entries for better readability
      const formattedTopic = {
        id: topic.id,
        title: topic.title,
        message: topic.message?.replace(/<[^>]*>/g, '') || 'No message',
        author: topic.author_name || 'Unknown',
        posted_at: topic.posted_at ? new Date(topic.posted_at).toLocaleString() : 'Unknown',
        url: topic.html_url
      };
      
      const formatEntry = (entry: DiscussionEntry, depth = 0): string => {
        const indent = '  '.repeat(depth);
        let result = `${indent}From: ${entry.user_name}\n${indent}Posted: ${new Date(entry.created_at).toLocaleString()}\n${indent}Message: ${entry.message.replace(/<[^>]*>/g, '')}\n`;
        
        if (entry.replies && entry.replies.length > 0) {
          result += `${indent}Replies:\n`;
          entry.replies.forEach(reply => {
            result += `\n${formatEntry(reply, depth + 1)}`;
          });
        }
        
        return result;
      };
      
      const formattedEntries = entries.map(entry => formatEntry(entry));

      return {
        content: [
          {
            type: "text",
            text: `Discussion Topic: ${formattedTopic.title}\nAuthor: ${formattedTopic.author}\nPosted: ${formattedTopic.posted_at}\n\n${formattedTopic.message}\n\nReplies:\n\n${formattedEntries.length > 0 ? formattedEntries.join('\n---\n') : 'No replies yet.'}`,
          },
        ],
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch discussion topic: ${error.message}`);
      }
      throw new Error('Failed to fetch discussion topic: Unknown error');
    }
  }

  /**
   * Retrieve student's submission details for a quiz
   */
  async getMyQuizSubmission(args: { courseId: string; quizId: string }) {
    const { courseId, quizId } = args;
    
    try {
      // Get quiz information
      const quizResponse = await this.axiosInstance.get(
        `/api/v1/courses/${courseId}/quizzes/${quizId}`
      );
      
      const quiz = quizResponse.data;
      
      // Get quiz submissions
      const submissionsResponse = await this.axiosInstance.get(
        `/api/v1/courses/${courseId}/quizzes/${quizId}/submissions`
      );
      
      const submissions = submissionsResponse.data.quiz_submissions;
      
      // Filter for the current user's submission
      // In a self-service context, there should typically be only one submission
      const mySubmission = submissions.length > 0 ? submissions[0] : null;
      
      if (!mySubmission) {
        return {
          content: [
            {
              type: "text",
              text: `No submission found for quiz "${quiz.title}".`,
            },
          ],
        };
      }
      
      // Format the submission details
      const formattedSubmission = {
        quiz_title: quiz.title,
        quiz_points_possible: quiz.points_possible,
        attempt: mySubmission.attempt,
        score: mySubmission.score,
        score_percent: quiz.points_possible ? (mySubmission.score / quiz.points_possible) * 100 : null,
        started_at: mySubmission.started_at ? new Date(mySubmission.started_at).toLocaleString() : 'Unknown',
        finished_at: mySubmission.finished_at ? new Date(mySubmission.finished_at).toLocaleString() : 'Not completed',
        time_spent: this.formatTimeDuration(mySubmission.time_spent),
        status: mySubmission.workflow_state,
        url: mySubmission.html_url
      };

      return {
        content: [
          {
            type: "text",
            text: `Quiz Submission:\n\nQuiz: ${formattedSubmission.quiz_title}\nAttempt: ${formattedSubmission.attempt}\nScore: ${formattedSubmission.score !== null ? formattedSubmission.score : 'Not graded'} / ${formattedSubmission.quiz_points_possible}${formattedSubmission.score_percent !== null ? ` (${formattedSubmission.score_percent.toFixed(2)}%)` : ''}\nStarted: ${formattedSubmission.started_at}\nFinished: ${formattedSubmission.finished_at}\nTime Spent: ${formattedSubmission.time_spent}\nStatus: ${formattedSubmission.status}\nURL: ${formattedSubmission.url}`,
          },
        ],
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch quiz submission: ${error.message}`);
      }
      throw new Error('Failed to fetch quiz submission: Unknown error');
    }
  }

  // Helper method to format file size
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  // Helper method to format time duration in seconds
  private formatTimeDuration(seconds: number): string {
    if (!seconds) return 'Unknown';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    let result = '';
    if (hours > 0) result += `${hours} hour${hours > 1 ? 's' : ''} `;
    if (minutes > 0) result += `${minutes} minute${minutes > 1 ? 's' : ''} `;
    if (remainingSeconds > 0 || result === '') 
      result += `${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
    
    return result.trim();
  }
} 