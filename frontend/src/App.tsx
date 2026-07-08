import { Navigate, Route, Routes } from 'react-router-dom'
import DashboardLayout from './layouts/DashboardLayout'
import CourseRoomPage from './pages/CourseRoomPage'
import CreateCoursePage from './pages/CreateCoursePage'
import LandingPage from './pages/LandingPage'
import PostWritePage from './pages/PostWritePage'
import SettingsPage from './pages/SettingsPage'
import StudentCoursesPage from './pages/StudentCoursesPage'
import UnansweredQuestionsPage from './pages/UnansweredQuestionsPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/room/:courseId" element={<CourseRoomPage />} />
      <Route path="/room/:courseId/write" element={<PostWritePage />} />
      <Route element={<DashboardLayout />}>
        <Route path="/courses" element={<StudentCoursesPage />} />
        <Route path="/courses/new" element={<CreateCoursePage />} />
        <Route path="/courses/:courseId/edit" element={<CreateCoursePage />} />
        <Route path="/questions" element={<UnansweredQuestionsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
