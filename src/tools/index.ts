import { Tool } from "./types.js";
import { listCoursesTool } from "./listCourses.js";
import { listRubricsTool } from "./listRubrics.js";
import { listAssignmentsTool } from "./listAssignments.js";
import { listSectionsTool } from "./listSections.js";
import { getMyTodoItemsTool } from "./getMyTodoItems.js";
import { getUpcomingAssignmentsTool } from "./getUpcomingAssignments.js";
import { getCourseGradeTool } from "./getCourseGrade.js";
import { getAssignmentDetailsTool } from "./getAssignmentDetails.js";
import { getRecentAnnouncementsTool } from "./getRecentAnnouncements.js";
import { findCourseFilesTool } from "./findCourseFiles.js";
import { findOfficeHoursTool } from "./findOfficeHours.js";

export const tools: Tool[] = [
  listCoursesTool,
  listRubricsTool,
  listAssignmentsTool,
  listSectionsTool,
  getMyTodoItemsTool,
  getUpcomingAssignmentsTool,
  getCourseGradeTool,
  getAssignmentDetailsTool,
  getRecentAnnouncementsTool,
  findCourseFilesTool,
  findOfficeHoursTool,
];

export type { Tool, ToolContext } from "./types.js";
