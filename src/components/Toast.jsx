export function Toast({ message, type = 'success', visible }) {
  if (!visible) return null;

  const bgClass = type === 'success' ? 'bg-success' : type === 'warning' ? 'bg-warning' : 'bg-red-500';

  return (
    <div className={`fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-white text-sm font-medium shadow-lg transition-opacity duration-300 ${bgClass} z-50`}>
      {message}
    </div>
  );
}
