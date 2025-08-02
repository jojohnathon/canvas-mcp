import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { createCanvasClient } from './api/canvasClient.js';
import { logger } from './logger.js';
import {
  Announcement,
  Assignment,
  CanvasConfig,
  CourseFile,
  CourseGrade,
  Page,
  TodoItem,
} from './types.js';

// Helper function for delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Main class for handling student tools
export class StudentTools {
  private axiosInstance: AxiosInstance;

  constructor(config: CanvasConfig) {
    this.axiosInstance = createCanvasClient(config);
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
        const title = item.title || (item.assignment ? item.assignment.name : 'Untitled Item');
        const dueDate = item.assignment?.due_at
          ? new Date(item.assignment.due_at).toLocaleString()
          : 'No due date';

        return {
          title,
          type: item.type,
          course_name: item.context_name,
          due_date: dueDate,
          points_possible: item.assignment?.points_possible || null,
          url: item.html_url,
        };
      });

      return {
        content: [
          {
            type: 'text',
            text:
              todoItems.length > 0
                ? `To-Do Items:\n\n${formattedResult
                  .map(
                    item =>
                      `Title: ${item.title}\nType: ${item.type}\nCourse: ${item.course_name}\nDue Date: ${item.due_date}${item.points_possible ? `\nPoints: ${item.points_possible}` : ''}\nURL: ${item.url}\n---`
                  )
                  .join('\n')}`
                : 'No to-do items found.',
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
          per_page: 100,
        },
      });

      const courses = coursesResponse.data;

      // For each course, get upcoming assignments
      const assignmentPromises = courses.map(async (course: any) => {
        try {
          const assignmentsResponse = await this.axiosInstance.get(
            `/api/v1/courses/${course.id}/assignments`,
            {
              params: {
                bucket: 'upcoming',
                include: ['submission'],
                per_page: 50,
              },
            }
          );

          return assignmentsResponse.data.map((assignment: any) => ({
            ...assignment,
            course_name: course.name,
          }));
        } catch {
          return [];
        }
      });

      const assignmentsArrays = await Promise.all(assignmentPromises);
      const assignments: Assignment[] = assignmentsArrays.flat();

      // Sort by due date
      assignments.sort((a, b) => {
        if (!a.due_at) {
          return 1;
        }
        if (!b.due_at) {
          return -1;
        }
        return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
      });

      return {
        content: [
          {
            type: 'text',
            text:
              assignments.length > 0
                ? `Upcoming Assignments:\n\n${assignments
                  .map(
                    assignment =>
                      `Assignment: ${assignment.name}\nCourse: ${assignment.course_name}\nDue Date: ${assignment.due_at ? new Date(assignment.due_at).toLocaleString() : 'No due date'}\nPoints: ${assignment.points_possible}\n${assignment.submission ? `Submitted: ${assignment.submission.submitted_at ? 'Yes' : 'No'}\nScore: ${assignment.submission.score !== null ? assignment.submission.score : 'Not graded'}` : 'No submission information'}\nURL: ${assignment.html_url}\n---`
                  )
                  .join('\n')}`
                : 'No upcoming assignments found.',
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
  async getCourseGrade(args: { courseId: string; }) {
    const { courseId } = args;

    try {
      // Get course information
      const courseResponse = await this.axiosInstance.get(`/api/v1/courses/${courseId}`);
      const course = courseResponse.data;

      // Get enrollment information (which includes grades)
      const enrollmentResponse = await this.axiosInstance.get(
        `/api/v1/courses/${courseId}/enrollments`,
        {
          params: {
            user_id: 'self',
          },
        }
      );

      // Find the student enrollment
      const studentEnrollment = enrollmentResponse.data.find(
        (enrollment: any) =>
          enrollment.type === 'student' || enrollment.role === 'StudentEnrollment'
      );

      if (!studentEnrollment) {
        return {
          content: [
            {
              type: 'text',
              text: `No student enrollment found for course ${course.name} (ID: ${courseId}).`,
            },
          ],
        };
      }

      const gradeInfo: CourseGrade = {
        course_id: parseInt(courseId, 10), // Convert string to number
        course_name: course.name,
        current_grade: studentEnrollment.current_grade,
        current_score: studentEnrollment.current_score,
        final_grade: studentEnrollment.final_grade,
        final_score: studentEnrollment.final_score,
        html_url: `${this.axiosInstance.defaults.baseURL}/courses/${courseId}/grades`,
      };

      return {
        content: [
          {
            type: 'text',
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
  async getAssignmentDetails(args: { courseId: string; assignmentId: string; }) {
    const { courseId, assignmentId } = args;

    try {
      const response = await this.axiosInstance.get(
        `/api/v1/courses/${courseId}/assignments/${assignmentId}`,
        {
          params: {
            include: ['submission'],
          },
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
        submission_status: submission
          ? {
            submitted: !!submission.submitted_at,
            submitted_at: submission.submitted_at,
            late: submission.late,
            missing: submission.missing,
            score: submission.score,
            grade: submission.grade,
            feedback: submission.submission_comments?.map((comment: any) => ({
              author: comment.author_name,
              comment: comment.comment,
              created_at: comment.created_at,
            })),
          }
          : null,
        html_url: assignment.html_url,
      };

      return {
        content: [
          {
            type: 'text',
            text: `Assignment Details:\n\nName: ${formattedAssignment.name}\nDue Date: ${formattedAssignment.due_at ? new Date(formattedAssignment.due_at).toLocaleString() : 'No due date'}\nPoints Possible: ${formattedAssignment.points_possible}\n\n${formattedAssignment.description ? `Description:\n${formattedAssignment.description.replace(/<[^>]*>/g, '')}\n\n` : ''}${formattedAssignment.submission_status
                ? `Submission Status:\nSubmitted: ${formattedAssignment.submission_status.submitted ? 'Yes' : 'No'}${formattedAssignment.submission_status.submitted_at ? `\nSubmission Date: ${new Date(formattedAssignment.submission_status.submitted_at).toLocaleString()}` : ''}${formattedAssignment.submission_status.late ? '\nStatus: Late' : ''}${formattedAssignment.submission_status.missing ? '\nStatus: Missing' : ''}\nScore: ${formattedAssignment.submission_status.score !== null ? formattedAssignment.submission_status.score : 'Not graded'}\nGrade: ${formattedAssignment.submission_status.grade || 'Not graded'}${formattedAssignment.submission_status.feedback &&
                  formattedAssignment.submission_status.feedback.length > 0
                  ? `\n\nFeedback:\n${formattedAssignment.submission_status.feedback.map((item: any) => `[${new Date(item.created_at).toLocaleString()}] ${item.author}: ${item.comment}`).join('\n')}`
                  : ''
                }`
                : 'No submission information available.'
              }\n\nURL: ${formattedAssignment.html_url}`,
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
   * Fetch recent announcements from all active courses or a specific course
   */
  async getRecentAnnouncements(args?: {
    days?: number;
    courseId?: string;
  }): Promise<{ content: { type: string; text: string; }[]; }> {
    const days = args?.days || 14;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    const params: any = {
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      per_page: 50,
      active_only: true,
    };

    const contextCodes: string[] = [];
    const courseMap = new Map<number, string>();

    if (args?.courseId) {
      contextCodes.push(`course_${args.courseId}`);
      try {
        const courseResponse = await this.axiosInstance.get(`/api/v1/courses/${args.courseId}`);
        courseMap.set(parseInt(args.courseId, 10), courseResponse.data.name);
      } catch (courseError: any) {
        logger.warn(
          `Could not fetch course name for course ${args.courseId}: ${courseError.message}`
        );
      }
    } else {
      try {
        const coursesResponse = await this.axiosInstance.get('/api/v1/courses', {
          params: { enrollment_state: 'active', state: ['available'], per_page: 100 },
        });
        coursesResponse.data.forEach((course: any) => {
          contextCodes.push(`course_${course.id}`);
          courseMap.set(course.id, course.name);
        });
      } catch (courseError: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Could not list active courses to fetch announcements: ${courseError.message}`,
            },
          ],
        };
      }
    }

    if (contextCodes.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No active courses found${args?.courseId ? ` matching ID ${args.courseId}` : ''} to fetch announcements from.`,
          },
        ],
      };
    }

    params.context_codes = contextCodes;

    try {
      const announcements: Announcement[] = await this.fetchAllPages<Announcement>(
        '/api/v1/announcements',
        { params }
      );

      if (announcements.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No announcements found in the last ${days} days${args?.courseId ? ` for course ${args.courseId}` : ''}.`,
            },
          ],
        };
      }

      const formattedAnnouncements = announcements
        .map((ann: Announcement) => {
          const contextCodeParts = ann.context_code.split('_');
          const courseIdNum =
            contextCodeParts.length > 1 && contextCodeParts[1]
              ? parseInt(contextCodeParts[1], 10)
              : 0;
          const courseName = courseMap.get(courseIdNum) || `Course ID ${courseIdNum}`;
          const postedDate = ann.posted_at
            ? new Date(ann.posted_at).toLocaleString()
            : 'Unknown date';
          const messageText =
            ann.message
              ?.replace(/<[^>]*>/g, ' ')
              .replace(/&nbsp;/g, ' ')
              .replace(/\s+/g, ' ')
              .trim() || 'No message content.';
          return `Course: ${courseName} (ID: ${courseIdNum})\nTitle: ${ann.title}\nPosted: ${postedDate}\nMessage: ${messageText}\n---`;
        })
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `Recent Announcements (last ${days} days):\n\n${formattedAnnouncements}`,
          },
        ],
      };
    } catch (error: any) {
      const apiError = error.response?.data?.errors?.[0]?.message || error.message;
      throw new Error(`Failed to fetch announcements: ${apiError}`);
    }
  }

  /**
   * Searches files within a specific course.
   */
  async findCourseFiles(args: {
    courseId: string;
    searchTerm: string;
  }): Promise<{ content: { type: string; text: string; }[]; }> {
    const { courseId, searchTerm } = args;
    logger.info(`Searching files in course ${courseId} for term: ${searchTerm}`);

    try {
      const files: CourseFile[] = await this.fetchAllPages<CourseFile>(
        `/api/v1/courses/${courseId}/files`,
        {
          params: {
            search_term: searchTerm,
            per_page: 50,
            sort: 'name',
            order: 'asc',
          },
        }
      );

      if (files.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No files found matching "${searchTerm}" in course ${courseId}.`,
            },
          ],
        };
      }

      const formattedFiles = files
        .map((file: CourseFile) => {
          return `File: ${file.display_name}\nID: ${file.id}\nSize: ${this.formatFileSize(file.size)}\nCreated: ${new Date(file.created_at).toLocaleDateString()}\nModified: ${new Date(file.updated_at).toLocaleDateString()}\nType: ${file.content_type}\nURL: ${file.url}\n---`;
        })
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `Files matching "${searchTerm}" in course ${courseId}:\n\n${formattedFiles}`,
          },
        ],
      };
    } catch (error: any) {
      const apiError = error.response?.data?.errors?.[0]?.message || error.message;
      throw new Error(`Failed to search files: ${apiError}`);
    }
  }

  /**
   * Lists published pages within a specific course.
   */
  async listCoursePages(args: { courseId: string; }): Promise<Page[]> {
    // Return the raw Page array
    const { courseId } = args;
    logger.info(`Listing pages in course ${courseId}`);

    try {
      // Fetch only published pages, sort by title
      const pages: Page[] = await this.fetchAllPages<Page>(`/api/v1/courses/${courseId}/pages`, {
        params: {
          published: true,
          per_page: 50,
          sort: 'title',
          order: 'asc',
        },
      });
      return pages; // Return the data directly
    } catch (error: any) {
      const apiError = error.response?.data?.errors?.[0]?.message || error.message;
      // Re-throw the error so the caller (findOfficeHoursInfo) can handle it
      throw new Error(`Failed to list course pages: ${apiError}`);
    }
  }

  /**
   * Fetches the full content of a specific course page.
   */
  async getPageContent(args: { courseId: string; pageUrl: string; }): Promise<Page | null> {
    const { courseId, pageUrl } = args;
    logger.info(`Fetching content for page ${pageUrl} in course ${courseId}`);
    try {
      // The pageUrl is the identifier used in the API endpoint
      const response = await this.axiosInstance.get<Page>(
        `/api/v1/courses/${courseId}/pages/${pageUrl}`
      );
      return response.data; // Returns the page object including the 'body'
    } catch (error: any) {
      // Handle 404 Not Found gracefully
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        logger.warn(`Page ${pageUrl} not found in course ${courseId}.`);
        return null;
      }
      const apiError = error.response?.data?.errors?.[0]?.message || error.message;
      // Re-throw other errors
      throw new Error(`Failed to fetch page content: ${apiError}`);
    }
  }

  /**
   * Searches common locations within a course for instructor office hours information.
   * Searches likely file names, recent announcements, and course pages.
   */
  async findOfficeHoursInfo(args: {
    courseId: string;
  }): Promise<{ content: { type: string; text: string; }[]; }> {
    const { courseId } = args;
    // Keywords to search *within* page/announcement content - Added 'syllabus'
    const contentKeywords = [
      'office',
      'hours',
      'contact',
      'schedule',
      'zoom',
      'meet',
      'appointment',
      'syllabus',
    ];
    // File names to search *for*
    const fileNameKeywords = [
      'syllabus',
      'schedule',
      'contact',
      'info',
      'details',
      'welcome',
      'overview',
    ];
    const findings: string[] = [];
    const errors: string[] = [];
    let syllabusPages: { title: string; url: string; }[] = []; // Store pages specifically mentioning syllabus

    // 1. Search Files (by likely names)
    try {
      logger.info(
        `Searching files in course ${courseId} for names like: ${fileNameKeywords.join(', ')}`
      );
      const foundFiles: { display_name: string; url: string; }[] = [];

      for (const term of fileNameKeywords) {
        try {
          // findCourseFiles searches *file names* using the API
          const fileResults = await this.findCourseFiles({ courseId, searchTerm: term });

          if (
            fileResults.content &&
            fileResults.content[0]?.text &&
            !fileResults.content[0].text.startsWith('No files found')
          ) {
            const fileText = fileResults.content[0].text;
            const fileEntries = fileText.split('---\n');
            fileEntries.forEach((entry: string) => {
              if (entry.trim()) {
                const nameMatch = entry.match(/File: (.*)/);
                const urlMatch = entry.match(/URL: (.*)/);
                if (
                  nameMatch &&
                  nameMatch[1] &&
                  urlMatch &&
                  urlMatch[1] &&
                  !foundFiles.some(f => f.display_name === nameMatch[1]!.trim())
                ) {
                  foundFiles.push({ display_name: nameMatch[1]!.trim(), url: urlMatch[1]!.trim() });
                }
              }
            });
          }
        } catch (fileError: any) {
          logger.warn(`Minor error searching files for name "${term}": ${fileError.message}`);
          errors.push(`Minor error searching files for name '${term}': ${fileError.message}`);
        }
        await delay(150); // Small delay between file searches
      }

      if (foundFiles.length > 0) {
        findings.push(
          `Found potential files (check these for syllabus, schedule, or contact info):\n${foundFiles.map(f => `- ${f.display_name} (${f.url})`).join('\n')}`
        );
      } else {
        if (!errors.some(e => !e.startsWith('Minor error'))) {
          findings.push("No files found with names like 'syllabus', 'schedule', 'contact', etc.");
        }
      }
    } catch (error: any) {
      errors.push(`Failed during file search: ${error.message}`);
    }

    // 2. Search Recent Announcements (for keywords in content)
    try {
      logger.info(
        `Searching recent announcements in course ${courseId} for keywords: ${contentKeywords.join(', ')}`
      );
      const announcementResult = await this.getRecentAnnouncements({
        days: 30,
        courseId: courseId,
      });
      const relevantAnnouncements: string[] = [];

      if (
        announcementResult.content &&
        announcementResult.content[0]?.text &&
        !announcementResult.content[0].text.startsWith('No announcements found')
      ) {
        const announcementText = announcementResult.content[0].text;
        const announcementEntries = announcementText.split('---\n');
        announcementEntries.forEach((entry: string) => {
          if (entry.trim()) {
            const titleMatch = entry.match(/Title: (.*)/);
            const messageMatch = entry.match(/Message: ([\s\S]*)/);
            if (titleMatch && titleMatch[1] && messageMatch && messageMatch[1]) {
              const title = titleMatch[1].trim();
              const message = messageMatch[1].trim().toLowerCase(); // Search case-insensitive
              const postedDateMatch = entry.match(/Posted: (.*)/);
              const postedDate =
                postedDateMatch && postedDateMatch[1] ? postedDateMatch[1].trim() : 'unknown date';

              // Check if title or message contains office hour keywords
              if (
                contentKeywords.some(
                  term => title.toLowerCase().includes(term) || message.includes(term)
                )
              ) {
                relevantAnnouncements.push(
                  `- Announcement: "${title}" (posted ${postedDate}) - Check message for details.`
                );
              }
            }
          }
        });
      }

      if (relevantAnnouncements.length > 0) {
        findings.push(
          `Found potentially relevant announcements:\n${relevantAnnouncements.join('\n')}`
        );
      } else {
        if (!errors.some(e => e.includes('announcements'))) {
          findings.push(
            'No recent announcements found containing office hour or syllabus keywords.'
          ); // Updated message
        }
      }
    } catch (error: any) {
      errors.push(`Failed to search announcements: ${error.message}`);
    }

    // 3. Search Course Pages (for keywords in content, highlighting syllabus)
    try {
      logger.info(
        `Searching course pages in course ${courseId} for keywords: ${contentKeywords.join(', ')}`
      );
      const pages = await this.listCoursePages({ courseId });
      const relevantPages: { title: string; url: string; }[] = []; // General relevant pages
      syllabusPages = []; // Reset syllabusPages for this run

      if (pages.length > 0) {
        for (const page of pages) {
          try {
            const pageWithContent = await this.getPageContent({ courseId, pageUrl: page.url });
            if (pageWithContent?.body) {
              const pageTitle = pageWithContent.title.toLowerCase();
              const pageBody = pageWithContent.body
                .replace(/<[^>]*>/g, ' ')
                .replace(/\s+/g, ' ')
                .toLowerCase();
              let isSyllabusRelated = false;

              // Check specifically for "syllabus"
              if (pageTitle.includes('syllabus') || pageBody.includes('syllabus')) {
                isSyllabusRelated = true;
                if (!syllabusPages.some(p => p.url === pageWithContent.html_url)) {
                  syllabusPages.push({
                    title: pageWithContent.title,
                    url: pageWithContent.html_url,
                  });
                }
              }

              // Check for other content keywords (office hours, contact, etc.)
              if (
                contentKeywords.some(
                  term =>
                    term !== 'syllabus' && (pageTitle.includes(term) || pageBody.includes(term))
                )
              ) {
                // Avoid adding duplicates if already added as syllabus-related
                if (
                  !isSyllabusRelated &&
                  !relevantPages.some(p => p.url === pageWithContent.html_url)
                ) {
                  relevantPages.push({
                    title: pageWithContent.title,
                    url: pageWithContent.html_url,
                  });
                }
              }
            }
          } catch (pageContentError: any) {
            logger.warn(
              `Could not fetch or search content for page "${page.title}": ${pageContentError.message}`
            );
          }
          await delay(150);
        }
      }

      // Add findings for syllabus pages first
      if (syllabusPages.length > 0) {
        findings.push(
          `Found pages related to the syllabus (check these first for office hours):\n${syllabusPages.map(p => `- Page: "${p.title}" (${p.url})`).join('\n')}`
        );
      }

      // Add findings for other relevant pages
      if (relevantPages.length > 0) {
        findings.push(
          `Found other potentially relevant pages:\n${relevantPages.map(p => `- Page: "${p.title}" (${p.url})`).join('\n')}`
        );
      }

      // Report if no relevant pages found
      if (syllabusPages.length === 0 && relevantPages.length === 0) {
        if (!errors.some(e => e.includes('pages'))) {
          findings.push(
            'No published pages found containing syllabus, office hour, or contact keywords.'
          ); // Updated message
        }
      }
    } catch (error: any) {
      errors.push(`Failed to search course pages: ${error.message}`);
    }

    // 4. Combine results
    let combinedResult = `Search results for office hours in course ${courseId}:\n\n`;
    const validFindings = findings.filter(f => !f.startsWith('No '));
    if (validFindings.length > 0) {
      // Prioritize syllabus pages in the output order if they exist
      const syllabusFinding = validFindings.find(
        f => f.includes('syllabus') && f.includes('Page:')
      );
      const otherFindings = validFindings.filter(
        f => !(f.includes('syllabus') && f.includes('Page:'))
      );

      if (syllabusFinding) {
        combinedResult += syllabusFinding + '\n\n'; // Add syllabus pages first
      }
      combinedResult += otherFindings.join('\n\n'); // Add the rest
    } else {
      combinedResult +=
        'Could not find specific information about office hours in likely file names, recent announcements, or course pages.';
    }

    combinedResult += '\n\n---';

    combinedResult +=
      "\n\n*Please Note:* This tool searched for files named 'syllabus', 'schedule', etc., and searched the *content* of recent announcements and course pages (including for the word 'syllabus'). It **cannot** search the content *inside* files (like PDFs or Word documents). Check the items listed above for details.";

    if (errors.length > 0) {
      const significantErrors = errors.filter(e => !e.startsWith('Minor error'));
      if (significantErrors.length > 0 || validFindings.length === 0) {
        combinedResult += `\n\nErrors encountered during search:\n- ${errors.join('\n- ')}`;
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: combinedResult.trim(), // Trim potential trailing newlines
        },
      ],
    };
  }

  /**
   * Helper method to fetch all pages for a paginated Canvas API endpoint.
   * Assumes the API uses Link headers for pagination.
   * Added generic type T for the expected data items.
   */
  private async fetchAllPages<T>(initialUrl: string, config?: any): Promise<T[]> {
    let results: T[] = [];
    let url: string | null = initialUrl;
    const requestConfig = { ...config };

    logger.debug(`Fetching all pages starting from: ${url}`);

    while (url) {
      try {
        const response: AxiosResponse<T[]> = await this.axiosInstance.get<T[]>(url, requestConfig);
        const responseData = Array.isArray(response.data) ? response.data : [response.data];
        results = results.concat(responseData);

        const linkHeader: string | undefined = response.headers['link'];
        url = null;
        if (linkHeader) {
          const links: string[] = linkHeader.split(',');
          const nextLink: string | undefined = links.find((link: string) =>
            link.includes('rel="next"')
          );
          if (nextLink) {
            const match: RegExpMatchArray | null = nextLink.match(/<(.*?)>/);
            if (match && match[1]) {
              url = match[1];
              logger.debug(`Found next page link: ${url}`);
              if (url) {
                await delay(100);
              }
            }
          }
        }
      } catch (error: any) {
        const apiError = error.response?.data?.errors?.[0]?.message || error.message;
        throw new Error(`Failed during pagination at ${url}: ${apiError}`);
      }
    }

    logger.debug(`Finished fetching all pages. Total items: ${results.length}`);
    return results;
  }

  // Helper method to format file size
  private formatFileSize(bytes: number): string {
    if (bytes === 0) {
      return '0 Bytes';
    }

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Helper method to format time duration in seconds
  private formatTimeDuration(seconds: number): string {
    if (!seconds) {
      return 'Unknown';
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    let result = '';
    if (hours > 0) {
      result += `${hours} hour${hours > 1 ? 's' : ''} `;
    }
    if (minutes > 0) {
      result += `${minutes} minute${minutes > 1 ? 's' : ''} `;
    }
    if (remainingSeconds > 0 || result === '') {
      result += `${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
    }

    return result.trim();
  }
}
