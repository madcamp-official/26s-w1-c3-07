import { Navigate, Route, Routes } from 'react-router-dom'
import DashboardLayout from './layouts/DashboardLayout'
import CourseRoomPage from './pages/CourseRoomPage'
import CreateCoursePage from './pages/CreateCoursePage'
import LandingPage from './pages/LandingPage'
import PostWritePage from './pages/PostWritePage'
import StudentCoursesPage from './pages/StudentCoursesPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/room/:courseId" element={<CourseRoomPage />} />
      <Route path="/room/:courseId/write" element={<PostWritePage />} />
      <Route element={<DashboardLayout />}>
        <Route path="/student/courses" element={<StudentCoursesPage />} />
        <Route path="/student/courses/new" element={<CreateCoursePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
