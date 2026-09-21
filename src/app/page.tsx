export default function Home() {
  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 640 }}>
      <h1>Fresh Fold — Stage 1 + 2 API</h1>
      <p>
        This is the API-only build. There is no customer/dry-cleaner/admin
        UI yet — that&apos;s the next stage. Test the endpoints with curl
        or an API client:
      </p>
      <ul>
        <li>POST /api/auth/request-otp</li>
        <li>POST /api/auth/verify-otp</li>
        <li>GET / POST /api/drycleaners (search / self-register)</li>
        <li>GET /api/drycleaners/:id</li>
        <li>GET / POST /api/drycleaners/:id/services</li>
        <li>PATCH /api/drycleaners/:id/services/:serviceId (propose edit/delete)</li>
        <li>GET /api/admin/drycleaners (approvals list)</li>
        <li>POST /api/admin/drycleaners/:id/status</li>
        <li>POST /api/admin/services/:serviceId (approve/reject)</li>
        <li>POST /api/orders</li>
        <li>GET /api/orders</li>
        <li>GET /api/orders/:id</li>
        <li>POST /api/orders/:id/status</li>
        <li>POST /api/orders/:id/assign</li>
        <li>POST / GET /api/orders/:id/photos</li>
        <li>POST / GET /api/orders/:id/defects</li>
        <li>POST /api/orders/:id/pickup-confirmation</li>
        <li>POST /api/orders/:id/final-price</li>
        <li>POST /api/orders/:id/payment/final</li>
      </ul>
      <p>See README.md for setup instructions and a full curl walkthrough.</p>
    </main>
  );
}
