import Link from 'next/link';

export default function DeveloperFooter() {
  return (
    <footer className="mt-12 pb-8 text-center">
      <div className="border-t border-gray-200 pt-6">
        <div className="flex items-center justify-center gap-3 mt-2">
          <Link href="/" className="text-xs text-sunset-600 hover:text-sunset-700 underline">
            Home
          </Link>
          <span className="text-xs text-gray-300">|</span>
          <Link href="/contact" className="text-xs text-sunset-600 hover:text-sunset-700 underline">
            Contact
          </Link>
          <span className="text-xs text-gray-300">|</span>
          <Link href="/help" className="text-xs text-sunset-600 hover:text-sunset-700 underline">
            Help & Support
          </Link>
        </div>
        <p className="text-xs text-gray-300 mt-2">
          &copy; {new Date().getFullYear()} Lesson Tracker. All rights reserved.
        </p>
      </div>
    </footer>
  );
}