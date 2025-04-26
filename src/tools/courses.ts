import axios, { AxiosInstance } from 'axios';
import { CourseGrade, CourseFile, Page } from '../types.js';
import { fetchAllPages, formatFileSize, delay } from '../utils.js';

/**
 * Fetch student's current grade in a specific course
 */
export async function getCourseGrade(axiosInstance: AxiosInstance, args: { courseId: string }) {
  const { courseId } = args;

  try {
    // Get course information
    const courseResponse = await axiosInstance.get(`/api/v1/courses/${courseId}`);
    const course = courseResponse.data;

    // Get enrollment information (which includes grades)
    const enrollmentResponse = await axiosInstance.get(
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
      course_id: parseInt(courseId, 10), // Convert string to number
      course_name: course.name,
      current_grade: studentEnrollment.grades?.current_grade, // Use optional chaining
      current_score: studentEnrollment.grades?.current_score, // Use optional chaining
      final_grade: studentEnrollment.grades?.final_grade,     // Use optional chaining
      final_score: studentEnrollment.grades?.final_score,     // Use optional chaining
      html_url: `${axiosInstance.defaults.baseURL}/courses/${courseId}/grades`
    };

    // Concise formatting
    const currentGradeStr = gradeInfo.current_grade || (gradeInfo.current_score !== null ? `${gradeInfo.current_score}%` : 'N/A');
    const finalGradeStr = gradeInfo.final_grade || (gradeInfo.final_score !== null ? `${gradeInfo.final_score}%` : 'N/A');

    return {
      content: [
        {
          type: "text",
          text: `Grade for ${gradeInfo.course_name}: Current: ${currentGradeStr}, Final: ${finalGradeStr} (Details: ${gradeInfo.html_url})`,
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
 * Searches files within a specific course.
 */
export async function findCourseFiles(axiosInstance: AxiosInstance, args: { courseId: string; searchTerm: string }): Promise<{ content: { type: string; text: string }[] }> {
  const { courseId, searchTerm } = args;
  console.log(`Searching files in course ${courseId} for term: ${searchTerm}`);

  try {
    const files: CourseFile[] = await fetchAllPages<CourseFile>(axiosInstance, `/api/v1/courses/${courseId}/files`, {
      params: {
        search_term: searchTerm,
        per_page: 50,
        sort: 'name',
        order: 'asc',
      },
    });

    if (files.length === 0) {
      return { content: [{ type: "text", text: `No files found matching "${searchTerm}" in course ${courseId}.` }] };
    }

    // Concise formatting
    const formattedFiles = files
      .map((file: CourseFile) => {
        return `- ${file.display_name} (ID: ${file.id}, Size: ${formatFileSize(file.size)}, Type: ${file.content_type}, URL: ${file.url})`;
      })
      .join('\n');

    return {
      content: [
        {
          type: "text",
          text: `Files matching "${searchTerm}" in course ${courseId}:\n\n${formattedFiles}`,
        },
      ],
    };
  } catch (error: any) {
    console.error(`Error searching files in course ${courseId}: ${error.message}`, error.response?.data);
    const apiError = error.response?.data?.errors?.[0]?.message || error.message;
    throw new Error(`Failed to search files: ${apiError}`);
  }
}

/**
 * Lists published pages within a specific course.
 */
export async function listCoursePages(axiosInstance: AxiosInstance, args: { courseId: string }): Promise<Page[]> { // Return the raw Page array
  const { courseId } = args;
  console.log(`Listing pages in course ${courseId}`);

  try {
    // Fetch only published pages, sort by title
    const pages: Page[] = await fetchAllPages<Page>(axiosInstance, `/api/v1/courses/${courseId}/pages`, {
      params: {
        published: true,
        per_page: 50,
        sort: 'title',
        order: 'asc',
      },
    });
    return pages; // Return the data directly
  } catch (error: any) {
    console.error(`Error listing pages in course ${courseId}: ${error.message}`, error.response?.data);
    const apiError = error.response?.data?.errors?.[0]?.message || error.message;
    // Re-throw the error so the caller (findOfficeHoursInfo) can handle it
    throw new Error(`Failed to list course pages: ${apiError}`);
  }
}

/**
 * Fetches the full content of a specific course page.
 */
export async function getPageContent(axiosInstance: AxiosInstance, args: { courseId: string; pageUrl: string }): Promise<Page | null> {
  const { courseId, pageUrl } = args;
  console.log(`Fetching content for page ${pageUrl} in course ${courseId}`);
  try {
    // The pageUrl is the identifier used in the API endpoint
    const response = await axiosInstance.get<Page>(`/api/v1/courses/${courseId}/pages/${pageUrl}`);
    return response.data; // Returns the page object including the 'body'
  } catch (error: any) {
    // Handle 404 Not Found gracefully
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      console.warn(`Page ${pageUrl} not found in course ${courseId}.`);
      return null;
    }
    console.error(`Error fetching page content for ${pageUrl} in course ${courseId}: ${error.message}`, error.response?.data);
    const apiError = error.response?.data?.errors?.[0]?.message || error.message;
    // Re-throw other errors
    throw new Error(`Failed to fetch page content: ${apiError}`);
  }
}

/**
 * Searches common locations within a course for instructor office hours information.
 * Searches likely file names, recent announcements, and course pages.
 */
export async function findOfficeHoursInfo(axiosInstance: AxiosInstance, args: { courseId: string }): Promise<{ content: { type: string; text: string }[] }> {
  const { courseId } = args;
  // Keywords to search *within* page/announcement content - Added 'syllabus'
  const contentKeywords = ["office", "hours", "contact", "schedule", "zoom", "meet", "appointment", "syllabus"];
  // File names to search *for*
  const fileNameKeywords = ["syllabus", "schedule", "contact", "info", "details", "welcome", "overview"];
  let findings: string[] = [];
  let errors: string[] = [];
  let syllabusPages: { title: string; url: string }[] = []; // Store pages specifically mentioning syllabus

  // 1. Search Files (by likely names)
  try {
    console.log(`Searching files in course ${courseId} for names like: ${fileNameKeywords.join(', ')}`);
    let foundFiles: { display_name: string; url: string }[] = [];

    for (const term of fileNameKeywords) {
      try {
        // Use the exported findCourseFiles function
        const fileResults = await findCourseFiles(axiosInstance, { courseId, searchTerm: term });

        if (fileResults.content && fileResults.content[0]?.text && !fileResults.content[0].text.startsWith("No files found")) {
          const fileText = fileResults.content[0].text;
          // Parse the concise format
          const fileLines = fileText.split('\n').filter(line => line.startsWith('-'));
          fileLines.forEach((line: string) => {
            const nameMatch = line.match(/- (.*?)\s\(ID:/);
            const urlMatch = line.match(/URL: (.*?)\)/);
            if (nameMatch && urlMatch && !foundFiles.some(f => f.display_name === nameMatch[1].trim())) {
              foundFiles.push({ display_name: nameMatch[1].trim(), url: urlMatch[1].trim() });
            }
          });
        }
      } catch (fileError: any) {
        console.warn(`Minor error searching files for name "${term}": ${fileError.message}`);
        errors.push(`Minor error searching files for name '${term}': ${fileError.message}`);
      }
      await delay(150); // Small delay between file searches
    }

    if (foundFiles.length > 0) {
      findings.push(`Found potential files (check these for syllabus, schedule, or contact info):\n${foundFiles.map(f => `- ${f.display_name} (${f.url})`).join('\n')}`);
    } else {
      if (!errors.some(e => !e.startsWith('Minor error'))) {
        findings.push("No files found with names like 'syllabus', 'schedule', 'contact', etc.");
      }
    }
  } catch (error: any) {
    console.error(`Error during file search process: ${error.message}`);
    errors.push(`Failed during file search: ${error.message}`);
  }

  // 2. Search Recent Announcements (using the function from announcements.ts - requires modification in index.ts)
  // Placeholder: This part needs to be handled in index.ts by calling the correct function
  // For now, we'll skip this step in this isolated function.
  // findings.push("Skipped announcement search (handled externally).");

  // 3. Search Course Pages (for keywords in content, highlighting syllabus)
  try {
    console.log(`Searching course pages in course ${courseId} for keywords: ${contentKeywords.join(', ')}`);
    // Use the exported listCoursePages function
    const pages = await listCoursePages(axiosInstance, { courseId });
    let relevantPages: { title: string; url: string }[] = []; // General relevant pages
    syllabusPages = []; // Reset syllabusPages for this run

    if (pages.length > 0) {
      for (const page of pages) {
        try {
          // Use the exported getPageContent function
          const pageWithContent = await getPageContent(axiosInstance, { courseId, pageUrl: page.url });
          if (pageWithContent?.body) {
            const pageTitle = pageWithContent.title.toLowerCase();
            const pageBody = pageWithContent.body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').toLowerCase();
            let isSyllabusRelated = false;
            let isGenerallyRelevant = false;

            // Check specifically for "syllabus"
            if (pageTitle.includes("syllabus") || pageBody.includes("syllabus")) {
              isSyllabusRelated = true;
              if (!syllabusPages.some(p => p.url === pageWithContent.html_url)) {
                syllabusPages.push({ title: pageWithContent.title, url: pageWithContent.html_url });
              }
            }

            // Check for other content keywords (office hours, contact, etc.)
            if (contentKeywords.some(term => term !== "syllabus" && (pageTitle.includes(term) || pageBody.includes(term)))) {
              isGenerallyRelevant = true;
              // Avoid adding duplicates if already added as syllabus-related
              if (!isSyllabusRelated && !relevantPages.some(p => p.url === pageWithContent.html_url)) {
                relevantPages.push({ title: pageWithContent.title, url: pageWithContent.html_url });
              }
            }
          }
        } catch (pageContentError: any) {
          console.warn(`Could not fetch or search content for page "${page.title}": ${pageContentError.message}`);
        }
        await delay(150);
      }
    }

    // Add findings for syllabus pages first
    if (syllabusPages.length > 0) {
      findings.push(`Found pages related to the syllabus (check these first for office hours):\n${syllabusPages.map(p => `- Page: "${p.title}" (${p.url})`).join('\n')}`);
    }

    // Add findings for other relevant pages
    if (relevantPages.length > 0) {
      findings.push(`Found other potentially relevant pages:\n${relevantPages.map(p => `- Page: "${p.title}" (${p.url})`).join('\n')}`);
    }

    // Report if no relevant pages found
    if (syllabusPages.length === 0 && relevantPages.length === 0) {
      if (!errors.some(e => e.includes('pages'))) {
        findings.push("No published pages found containing syllabus, office hour, or contact keywords."); // Updated message
      }
    }
  } catch (error: any) {
    console.error(`Error searching course pages: ${error.message}`);
    errors.push(`Failed to search course pages: ${error.message}`);
  }

  // 4. Combine results
  let combinedResult = `Search results for office hours in course ${courseId}:\n\n`;
  const validFindings = findings.filter(f => !f.startsWith("No "));
  if (validFindings.length > 0) {
    // Prioritize syllabus pages in the output order if they exist
    const syllabusFinding = validFindings.find(f => f.includes("syllabus") && f.includes("Page:"));
    const otherFindings = validFindings.filter(f => !(f.includes("syllabus") && f.includes("Page:")));

    if (syllabusFinding) {
      combinedResult += syllabusFinding + '\n\n'; // Add syllabus pages first
    }
    combinedResult += otherFindings.join('\n\n'); // Add the rest
  } else {
    combinedResult += "Could not find specific information about office hours in likely file names or course pages."; // Removed announcements part
  }

  combinedResult += "\n\n---";

  combinedResult += "\n\n*Please Note:* This tool searched for files named 'syllabus', 'schedule', etc., and searched the *content* of course pages (including for the word 'syllabus'). It **cannot** search the content *inside* files (like PDFs or Word documents) or announcements (search announcements separately). Check the items listed above for details.";

  if (errors.length > 0) {
    const significantErrors = errors.filter(e => !e.startsWith('Minor error'));
    if (significantErrors.length > 0 || validFindings.length === 0) {
      combinedResult += `\n\nErrors encountered during search:\n- ${errors.join('\n- ')}`;
    }
  }

  return {
    content: [
      {
        type: "text",
        text: combinedResult.trim(), // Trim potential trailing newlines
      },
    ],
  };
}
