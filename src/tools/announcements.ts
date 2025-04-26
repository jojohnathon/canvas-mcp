import { AxiosInstance } from 'axios';
import { Announcement } from '../types.js';
import { fetchAllPages, delay } from '../utils.js'; // Import helpers

/**
 * Fetch recent announcements from all active courses or a specific course
 */
export async function getRecentAnnouncements(axiosInstance: AxiosInstance, args?: { days?: number; courseId?: string }): Promise<{ content: { type: string; text: string }[] }> {
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

  let contextCodes: string[] = [];
  let courseMap = new Map<number, string>();

  if (args?.courseId) {
    contextCodes.push(`course_${args.courseId}`);
    try {
      const courseResponse = await axiosInstance.get(`/api/v1/courses/${args.courseId}`);
      courseMap.set(parseInt(args.courseId, 10), courseResponse.data.name);
    } catch (courseError: any) {
      console.warn(`Could not fetch course name for course ${args.courseId}: ${courseError.message}`);
    }
  } else {
    try {
      const coursesResponse = await axiosInstance.get('/api/v1/courses', {
        params: { enrollment_state: 'active', state: ['available'], per_page: 100 }
      });
      coursesResponse.data.forEach((course: any) => {
        contextCodes.push(`course_${course.id}`);
        courseMap.set(course.id, course.name);
      });
    } catch (courseError: any) {
      console.error(`Failed to fetch active courses for announcements: ${courseError.message}`);
      return { content: [{ type: "text", text: `Could not list active courses to fetch announcements: ${courseError.message}` }] };
    }
  }

  if (contextCodes.length === 0) {
    return { content: [{ type: "text", text: `No active courses found${args?.courseId ? ` matching ID ${args.courseId}` : ''} to fetch announcements from.` }] };
  }

  params.context_codes = contextCodes;

  try {
    const announcements: Announcement[] = await fetchAllPages<Announcement>(axiosInstance, '/api/v1/announcements', { params });

    if (announcements.length === 0) {
      return { content: [{ type: "text", text: `No announcements found in the last ${days} days${args?.courseId ? ` for course ${args.courseId}` : ''}.` }] };
    }

    const formattedAnnouncements = announcements
      .map((ann: Announcement) => {
        const courseIdNum = parseInt(ann.context_code.split('_')[1], 10);
        const courseName = courseMap.get(courseIdNum) || `Course ID ${courseIdNum}`;
        const postedDate = ann.posted_at ? new Date(ann.posted_at).toLocaleString() : 'Unknown date';
        const messageText = ann.message?.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() || 'No message content.';
        // Concise format
        return `- [${courseName}] ${ann.title} (Posted: ${postedDate}) - ${messageText.substring(0, 100)}${messageText.length > 100 ? '...' : ''}`;
      })
      .join('\n');

    return {
      content: [
        {
          type: "text",
          text: `Recent Announcements (last ${days} days):\n\n${formattedAnnouncements}`,
        },
      ],
    };
  } catch (error: any) {
    console.error(`Error fetching announcements: ${error.message}`, error.response?.data);
    const apiError = error.response?.data?.errors?.[0]?.message || error.message;
    throw new Error(`Failed to fetch announcements: ${apiError}`);
  }
}
