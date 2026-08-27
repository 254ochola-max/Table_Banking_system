import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Mail, Info } from "lucide-react";

export default function About() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-5 py-12 sm:py-20">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-8 transition-colors">
          <ArrowRight size={16} className="rotate-180" /> Back to Dashboard
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-xl bg-amber-50">
            <Info size={24} className="text-amber-600" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-widest uppercase text-fuchsia-600" style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}>
            About Us
          </h1>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 space-y-4 text-gray-700 leading-relaxed">
          <p>
            THE DEBORAH'S Table Banking System is a comprehensive financial management platform designed to empower table banking groups with the tools they need to thrive. Table banking is a community-driven savings and lending model where members pool their contributions into a shared fund, from which they can borrow loans at agreed-upon interest rates. Our application streamlines this entire process — from tracking monthly contributions and managing member records, to administering loan cycles with automatic interest calculation, scheduling repayments, and generating detailed financial reports.
          </p>
          <p>
            The platform is built for table banking groups, welfare societies, chamas, and community savings collectives who need a reliable, transparent way to manage their group finances. It serves both group leaders — who handle administration, loan approvals, contribution verification, and reporting — and individual members, who can view their savings progress, apply for loans, and submit repayments through a dedicated member portal.
          </p>
          <p>
            THE DEBORAH'S Table Banking System is built and maintained to deliver secure, intuitive financial tools for communities. Every feature — from role-based access for leaders like the Chairperson and Treasurer, to automated loan reminders and verifiable contribution tracking — is designed to keep group funds transparent, accountable, and easy to manage for everyone involved.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-4">
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium bg-fuchsia-500 hover:bg-fuchsia-600 text-white transition-colors"
          >
            <Mail size={16} /> Contact Us
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Dashboard <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}