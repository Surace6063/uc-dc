import { Reveal } from "@/components/landing/motion"
import { SectionHeading } from "@/components/landing/section-heading"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

const faqs = [
  {
    question: "Can we use only the management system or only the LMS?",
    answer:
      "Yes. Modules can be switched on independently. Many institutions start with management and add the LMS later; your data carries over automatically.",
  },
  {
    question: "Does it support the Bikram Sambat calendar?",
    answer:
      "Yes. Dates can be shown in BS, AD or both, and academic years, routines and report cards follow the calendar you choose.",
  },
  {
    question: "Which grading systems are supported?",
    answer:
      "Letter grades with GPA, percentage-based results and custom grading scales. Report card templates can be adapted to your board or university format.",
  },
  {
    question: "How do you move our existing data?",
    answer:
      "Send us your current spreadsheets for students, staff, fees and past results. Our team cleans and imports them before you go live, at no extra cost.",
  },
  {
    question: "Is our data secure?",
    answer:
      "All traffic is encrypted, every user has role-based permissions, and data is backed up daily. Your institution always owns its data and can export it at any time.",
  },
  {
    question: "Do students and parents need to install an app?",
    answer:
      "No. Everything works in the browser on phones, tablets and computers, so anyone with a login can get started immediately.",
  },
]

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-16 border-t bg-card py-24 sm:py-32">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.5fr]">
        <SectionHeading
          align="left"
          eyebrow="questions & answers"
          title={
            <>
              Asked in <em>every staff meeting.</em>
            </>
          }
          description="Can't find yours? Ask us during the demo."
        />

        <Reveal delay={0.1}>
          <div className="relative rounded-lg border bg-paper bg-ruled py-4 pr-5 pl-14 shadow-lg shadow-black/5 sm:pr-8">
            <span aria-hidden className="absolute inset-y-0 left-10 w-px bg-margin" />
            <Accordion>
              {faqs.map((faq, i) => (
                <AccordionItem key={faq.question} value={faq.question} className="border-dashed">
                  <AccordionTrigger className="py-4 text-base hover:no-underline sm:text-lg">
                    <span className="flex gap-3">
                      <span className="-ml-11 w-8 shrink-0 text-right font-hand text-2xl leading-6 text-primary">
                        Q{i + 1}.
                      </span>
                      {faq.question}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="pb-2 text-base leading-relaxed text-muted-foreground">
                      {faq.answer}
                    </p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
