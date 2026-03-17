import { Navigate } from "react-router-dom";

export default function FollowUpsPage() {
  return <Navigate to="/pipelines?tab=follow_up" replace />;
}
