import { useParams } from "react-router-dom";
import { mockProjects, mockRequests } from "../lib/mockData";

export function ProjectRequestsPage() {
  const { id = "1" } = useParams();
  const project = mockProjects.find((item) => item.id === id) ?? mockProjects[0];
  const projectToken = project.name.split(" ")[0];
  const requests = mockRequests.filter((item) => item.from.includes(projectToken) || item.message.includes(projectToken));

  return (
    <section className="h-full overflow-y-auto bg-bg px-8 py-10">
      <div className="mb-8">
        <p className="font-bebas text-[12px] tracking-[0.18em] text-[#00b4a0]">REQUESTS</p>
        <h1 className="mt-2 font-bebas text-[48px] leading-none text-[#0a0a0a]">{project.name.toUpperCase()}</h1>
        <p className="mt-2 font-syne text-[14px] text-[#888888]">Communication and change requests linked to this project.</p>
      </div>

      <div className="space-y-4">
        {requests.map((request) => (
          <article
            key={request.id}
            className="rounded-[20px] border border-[#ecece7] bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.06),0_12px_32px_rgba(0,0,0,0.05)]"
          >
            <div className="flex items-start gap-4">
              <div>
                <p className="font-syne text-[16px] font-bold text-[#0a0a0a]">{request.from}</p>
                <p className="mt-2 font-syne text-[14px] leading-6 text-[#666666]">{request.message}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="font-bebas text-[12px] tracking-[0.16em] text-[#00b4a0]">{request.status.toUpperCase()}</p>
                <p className="mt-1 font-syne text-[12px] text-[#888888]">{request.time}</p>
              </div>
            </div>
          </article>
        ))}

        {requests.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-[#d9d9d4] bg-white/70 p-6 font-syne text-[14px] text-[#888888]">
            No requests are linked to this project in the current mock dataset.
          </div>
        ) : null}
      </div>
    </section>
  );
}
