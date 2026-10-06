export default function WhatsAppButton() {
  const href =
    "https://wa.me/918847498061?text=" +
    encodeURIComponent("Hi Fresh Folds, I need help with my order.");
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      style={{
        position: "fixed",
        right: 16,
        bottom: 84,
        width: 56,
        height: 56,
        borderRadius: "50%",
        background: "#25D366",
        boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 2C6.5 2 2 6.2 2 11.4c0 2.1.8 4.1 2.2 5.7L3 22l5.2-1.6c1.1.4 2.4.6 3.8.6 5.5 0 10-4.2 10-9.4S17.5 2 12 2z"
          fill="#ffffff"
        />
        <path
          d="M9 7.5c0 3.8 2.9 6.8 6.7 7.6l1.4-1.9-2.4-1.1-.9.8c-.9-.4-1.9-1.3-2.3-2.3l.8-.9L10.2 7.2 9 7.5z"
          fill="#25D366"
        />
      </svg>
    </a>
  );
}