'use client';

import { motion } from 'framer-motion';
import { SplineScene } from '@/components/ui/spline';
import { Spotlight } from '@/components/ui/spotlight';
import { Card } from '@/components/ui/card';
import { ContainerScroll } from '@/components/ui/container-scroll-animation';
import { RainbowMatrixShader } from '@/components/ui/rainbow-matrix-shader';

const fadeUpVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: 'easeOut' as const }
  }
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.3 }
  }
};

const scaleVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.6, ease: 'easeOut' as const } }
};

// Hero Section
function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#050505]">
      <div className="absolute inset-0 z-0">
        <SplineScene className="w-full h-full" />
        <Spotlight className="-top-40 left-0 md:left-60 md:-top-20" fill="#c9a84c" />
        {/* Animated gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#050505]" />
      </div>

      <motion.div
        className="relative z-10 text-center max-w-5xl mx-auto px-4"
        initial="hidden"
        animate="visible"
        variants={containerVariants}
      >
        <motion.h1
          className="text-6xl md:text-8xl font-bold mb-6 leading-tight text-[#f5f2ee]"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
          variants={fadeUpVariants}
        >
          Autonomous Intelligence,
          <br />
          <motion.span
            className="text-[#c9a84c]"
            animate={{ opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            Real Returns.
          </motion.span>
        </motion.h1>

        <motion.p
          className="text-lg md:text-xl text-[#9a9a9a] max-w-2xl mx-auto mb-8"
          variants={fadeUpVariants}
        >
          AI-powered acquisition and automation systems that generate wealth while you sleep.
        </motion.p>

        <motion.div
          className="flex gap-6 justify-center flex-wrap"
          variants={fadeUpVariants}
        >
          <motion.button
            className="px-8 py-3 bg-[#c9a84c] text-[#050505] font-bold hover:bg-[#d4b856] transition"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Get In Touch
          </motion.button>
          <motion.button
            className="px-8 py-3 border-2 border-[#c9a84c] text-[#c9a84c] font-bold hover:bg-[#c9a84c] hover:text-[#050505] transition"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Our Services
          </motion.button>
        </motion.div>
      </motion.div>
    </section>
  );
}

// Ticker Section
function TickerSection() {
  const items = [
    'Real Estate Wholesaling',
    'AI Automation',
    'Digital Commerce',
    'Intelligent Systems',
    'ARIA Capital LLC'
  ];

  return (
    <section className="py-8 overflow-hidden bg-[#0a0a0a] border-y border-[#1a1a1a]">
      <div className="relative">
        {/* Gradient fade effect */}
        <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-[#0a0a0a] to-transparent z-10" />
        <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-[#0a0a0a] to-transparent z-10" />

        <motion.div
          className="flex gap-8 whitespace-nowrap"
          animate={{ x: ['0%', '-100%'] }}
          transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
        >
          {[...items, ...items, ...items].map((item, idx) => (
            <motion.span
              key={idx}
              className="text-[#9a9a9a] text-lg font-light flex items-center gap-8 hover:text-[#c9a84c] transition"
              whileHover={{ scale: 1.05 }}
            >
              {item}
              <span className="text-[#c9a84c]">◆</span>
            </motion.span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// About Section - Stats
function AboutSection() {
  const stats = [
    { number: '14+', label: 'Active AI Agents' },
    { number: '3', label: 'Revenue Divisions' },
    { number: '24/7', label: 'Autonomous Operations' },
    { number: '$0', label: 'Hours Off' }
  ];

  return (
    <section className="py-24 px-4">
      <div className="max-w-7xl mx-auto">
        <motion.h2
          className="text-5xl md:text-6xl font-bold mb-16 text-center"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUpVariants}
        >
          By The Numbers
        </motion.h2>

        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 gap-8"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={containerVariants}
        >
          {stats.map((stat, idx) => (
            <motion.div key={idx} variants={scaleVariants}>
              <motion.div
                whileHover={{ scale: 1.02, borderColor: '#c9a84c' }}
                className="bg-[#0a0a0a] border border-[#1a1a1a] p-8 rounded-lg transition group"
              >
                <motion.p
                  className="text-5xl md:text-6xl font-bold text-[#c9a84c] mb-4"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity, delay: idx * 0.3 }}
                >
                  {stat.number}
                </motion.p>
                <p className="text-xl text-[#9a9a9a]">{stat.label}</p>
              </motion.div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// Services Section with ContainerScroll
function ServicesSection() {
  const services = [
    {
      title: 'Real Estate Acquisition',
      description: 'AI-powered lead generation, offer submission, and buyer matching. Autonomous deal flow.',
      details: '$5k-20k per deal'
    },
    {
      title: 'Digital Commerce Automation',
      description: 'Arbitrage and digital products across major marketplaces. Completely autonomous.',
      details: '24/7 automated'
    },
    {
      title: 'Intelligent Systems Development',
      description: 'Custom AI agent deployment tailored to your business processes and revenue goals.',
      details: 'Enterprise-scale'
    }
  ];

  return (
    <section className="py-24 px-4 bg-[#0a0a0a]">
      <div className="max-w-7xl mx-auto">
        <motion.h2
          className="text-5xl md:text-6xl font-bold mb-16 text-center"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUpVariants}
        >
          Our Services
        </motion.h2>

        <ContainerScroll
          titleComponent={
            <motion.div
              className="text-center mb-20"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ duration: 0.6 }}
            >
              <p className="text-[#9a9a9a] text-lg">Scroll to explore our capabilities</p>
            </motion.div>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full h-full">
            {services.map((service, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                viewport={{ once: true }}
              >
                <motion.div
                  whileHover={{ scale: 1.05, boxShadow: '0 0 20px rgba(201, 168, 76, 0.3)' }}
                  className="bg-[#050505] border border-[#1a1a1a] p-8 rounded-lg flex flex-col justify-between h-full transition"
                >
                  <div>
                    <h3 className="text-2xl font-bold mb-4 text-[#c9a84c]" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                      {service.title}
                    </h3>
                    <p className="text-[#9a9a9a] mb-6">{service.description}</p>
                  </div>
                  <p className="text-[#c9a84c] font-bold">{service.details}</p>
                </motion.div>
              </motion.div>
            ))}
          </div>
        </ContainerScroll>
      </div>
    </section>
  );
}

// Process Section
function ProcessSection() {
  const steps = [
    { number: '01', title: 'Deploy Intelligence', description: 'Custom AI agents tailored to your specific business needs and workflows.' },
    { number: '02', title: 'Generate Opportunity', description: 'Autonomous systems identify and qualify leads at scale, 24/7 without rest.' },
    { number: '03', title: 'Execute & Capture', description: 'Fully automated execution of deals and transactions with precision and speed.' },
    { number: '04', title: 'Scale & Evolve', description: 'Systems continuously learn and adapt to maximize returns and efficiency.' }
  ];

  return (
    <section className="py-24 px-4">
      <div className="max-w-5xl mx-auto">
        <motion.h2
          className="text-5xl md:text-6xl font-bold mb-20 text-center"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUpVariants}
        >
          The ARIA Process
        </motion.h2>

        <motion.div
          className="space-y-12"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={containerVariants}
        >
          {steps.map((step, idx) => (
            <motion.div key={idx} variants={fadeUpVariants} className="flex gap-8 group">
              <div className="flex-shrink-0">
                <span className="text-5xl font-bold text-[#c9a84c]" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                  {step.number}
                </span>
              </div>
              <div className="flex-grow border-l-2 border-[#1a1a1a] group-hover:border-[#c9a84c] pl-8 py-2 transition">
                <h3 className="text-2xl font-bold mb-2 text-[#f5f2ee]" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                  {step.title}
                </h3>
                <p className="text-[#9a9a9a]">{step.description}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// Shader Section
function ShaderSection() {
  return (
    <section className="relative min-h-[600px] py-24 overflow-hidden bg-gradient-to-br from-[#050505] via-purple-900 to-[#050505]">
      {/* Background shader with animated gradient */}
      <div className="absolute inset-0">
        <RainbowMatrixShader
          projectId="jYxrWzSRtsXNqZADHnVH"
          className="w-full h-full"
        />
      </div>

      {/* Animated gradient overlay */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-b from-[#050505] via-transparent to-[#050505]"
        animate={{ opacity: [0.5, 0.7, 0.5] }}
        transition={{ duration: 4, repeat: Infinity }}
      />

      {/* Content */}
      <div className="relative z-10 h-[600px] flex items-center justify-center px-4">
        <motion.div
          className="text-center"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={containerVariants}
        >
          <motion.h2
            className="text-5xl md:text-6xl font-bold text-center text-[#f5f2ee] mb-6"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
            variants={fadeUpVariants}
          >
            Where Intelligence
            <br />
            <motion.span
              className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400"
              animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              Meets Capital
            </motion.span>
          </motion.h2>
          <motion.p
            className="text-[#9a9a9a] text-lg max-w-2xl mx-auto"
            variants={fadeUpVariants}
          >
            Advanced AI systems powering wealth generation 24/7
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
}

// CTA Section
function CTASection() {
  return (
    <section className="py-24 px-4 bg-gradient-to-b from-[#0a0a0a] to-[#050505]">
      <motion.div
        className="max-w-4xl mx-auto text-center"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={containerVariants}
      >
        <motion.h2
          className="text-5xl md:text-7xl font-bold mb-12 text-[#f5f2ee]"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
          variants={fadeUpVariants}
        >
          Let the machines
          <br />
          <motion.span
            className="text-[#c9a84c]"
            animate={{ opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 2.5, repeat: Infinity }}
          >
            work for you.
          </motion.span>
        </motion.h2>

        <motion.div className="flex gap-6 justify-center flex-wrap" variants={fadeUpVariants}>
          <motion.button
            className="px-8 py-4 bg-[#c9a84c] text-[#050505] font-bold text-lg hover:bg-[#d4b856] transition rounded-lg"
            whileHover={{ scale: 1.05, boxShadow: '0 0 20px rgba(201, 168, 76, 0.4)' }}
            whileTap={{ scale: 0.95 }}
          >
            Get In Touch
          </motion.button>
          <motion.button
            className="px-8 py-4 border-2 border-[#c9a84c] text-[#c9a84c] font-bold text-lg hover:bg-[#c9a84c] hover:text-[#050505] transition rounded-lg"
            whileHover={{ scale: 1.05, boxShadow: '0 0 20px rgba(201, 168, 76, 0.2)' }}
            whileTap={{ scale: 0.95 }}
          >
            Our Services
          </motion.button>
        </motion.div>
      </motion.div>
    </section>
  );
}

// Footer
function Footer() {
  return (
    <footer className="border-t border-[#1a1a1a] py-12 px-4">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <p className="text-[#f5f2ee] font-bold">ARIA Capital LLC</p>
        <p className="text-[#9a9a9a]">&copy; 2026. All rights reserved.</p>
        <div className="flex gap-6 text-[#9a9a9a] text-sm">
          <a href="#" className="hover:text-[#c9a84c] transition">Privacy</a>
          <a href="#" className="hover:text-[#c9a84c] transition">Terms</a>
          <a href="#" className="hover:text-[#c9a84c] transition">Contact</a>
        </div>
      </div>
    </footer>
  );
}

// Main Component
export default function ARIAWebsite() {
  return (
    <main className="relative bg-[#050505] text-[#f5f2ee]">
      <HeroSection />
      <TickerSection />
      <AboutSection />
      <ServicesSection />
      <ProcessSection />
      <ShaderSection />
      <CTASection />
      <Footer />
    </main>
  );
}
