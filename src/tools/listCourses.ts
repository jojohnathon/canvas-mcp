import axios from "axios";
import { Tool } from "./types.js";
import { Course } from "../types.js";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const listCoursesTool: Tool = {
  name: "list-courses",
  description: "List all courses for the authenticated user",
  inputSchema: { type: "object", properties: {}, required: [] },
  execute: async (_args, { axios: client }) => {
    const maxRetries = 2;
    const retryDelay = 1000;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.error(`Attempt ${attempt + 1} to fetch courses...`);
        const response = await client.get('/api/v1/courses', {
          params: {
            enrollment_state: 'active',
            state: ['available'],
            per_page: 100,
            include: ['term']
          },
          timeout: 15000
        });
        const courses: Course[] = response.data;
        const formattedCourses = courses
          .filter(course => course.workflow_state === 'available')
          .map(course => {
            const termInfo = course.term ? ` (${course.term.name})` : '';
            return `Course: ${course.name}${termInfo}\nID: ${course.id}\nCode: ${course.course_code}\n---`;
          })
          .join('\n');
        return {
          content: [{
            type: "text",
            text: formattedCourses ? `Available Courses:\n\n${formattedCourses}` : "No active courses found."
          }]
        };
      } catch (error) {
        console.error(`Attempt ${attempt + 1} failed.`);
        if (axios.isAxiosError(error) && error.code === 'ECONNRESET') {
          console.error(`Axios ECONNRESET error fetching courses (Attempt ${attempt + 1}/${maxRetries + 1}): ${error.message}`);
          if (attempt < maxRetries) {
            console.error(`Retrying in ${retryDelay / 1000} second(s)...`);
            await delay(retryDelay);
            continue;
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
    throw new Error('listCoursesTool exited loop unexpectedly.');
  }
};
