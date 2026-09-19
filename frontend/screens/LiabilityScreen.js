/**
 * Terms of Use & Privacy Policy — shown once per ACCOUNT (not once per
 * session like ConsentScreen), right after login/signup, before anything
 * else. Blocks the rest of the app until accepted; acceptance is recorded
 * server-side (POST /auth/accept-liability, see App.js's
 * handleAcceptLiability) so a returning user on any device never sees it
 * again once they've agreed.
 *
 * Source: "TERMS OF USE and PRIVACY v2.pdf" (user-provided), transcribed
 * below verbatim except for:
 *  - A few bracketed blanks in the source that are filled in from values
 *    already established elsewhere in this app (see NEEDS_REVIEW below for
 *    what's still genuinely unfilled and why).
 *  - The source's duplicate section number ("15. 14. CONTACT US") fixed to
 *    "15. CONTACT US" — a numbering slip, not a wording change.
 *
 * NEEDS_REVIEW before this ships for real users — do not treat these as
 * final, they're flagged rather than guessed:
 *   1. COMPANY_LEGAL_NAME below is a placeholder. The source has "XX (the
 *      Company)" and an "[Insert Company name...]" trademark blank — I
 *      don't know your registered legal entity name (and this document is
 *      governed by Saskatchewan, Canada law, so this should be the exact
 *      registered name), so I won't guess it.
 *   2. PRIVACY_OFFICER_CONTACT reuses organizingapp@homefreeorganizing.ca
 *      (the existing "Need Help" contact from the sidebar) since that's a
 *      real, already-established address — swap it below if you want a
 *      distinct Privacy Officer contact instead.
 *   3. The Privacy Policy section "How We Protect Personal Information"
 *      contains a line that reads "we can not guarantee that the Personal
 *      Information will not be ... stored inside Canada" — given the
 *      surrounding paragraphs are all about data going OUTSIDE Canada
 *      (US/EU), this reads like it should say "outside Canada." I did NOT
 *      silently correct it since that changes legal meaning — transcribed
 *      exactly as provided. Worth double-checking against your source doc.
 */

import React from 'react';
import { StyleSheet, Text, View, SafeAreaView, ScrollView } from 'react-native';
import Colors from '../constants/Colors';
import Fonts from '../constants/Fonts';
import Button from '../components/Button';
import Icon from '../components/Icon';

const COMPANY_LEGAL_NAME = '[COMPANY LEGAL NAME — NEEDS REVIEW]';
const APP_NAME = 'Home Free Organizing';
const PRIVACY_OFFICER_CONTACT = 'organizingapp@homefreeorganizing.ca';
const LAST_UPDATED = 'September 19, 2026';

const TERMS_SECTIONS = [
  {
    heading: '1. ACCEPTANCE OF TERMS',
    body: `“${APP_NAME}” provides Services (as defined below) to you through this digital marketplace platform (“App”) and access to and use of this App and the Services are provided to you subject to your acceptance of and compliance with the following terms and conditions (“Terms”).\n\nBy indicating your acceptance below, you acknowledge that you have read, accepted, and agreed to these Terms. If you do not agree to these Terms, you will not be able to use this App.\n\nIn addition, when using the Services, you will be subject to any posted guidelines or rules applicable to such Services which may be posted from time to time. All such guidelines or rules are hereby incorporated by reference into these Terms. Company reserves the right to change these Terms at any time without prior notice and your continued access or use of this App or the Services after such changes indicates your acceptance of the Terms as modified. It is your responsibility to review these Terms regularly. These Terms were last updated on ${LAST_UPDATED}.\n\nIf you do not agree with one or more of these Terms, do not access or use this App or the Services.`,
  },
  {
    heading: `2. About “${APP_NAME}”`,
    body: `${COMPANY_LEGAL_NAME} (the “Company”), is an AI-powered digital home organization application (“the App”) that analyzes uploaded interior photos to deliver personalized space-saving tips, while seamlessly connecting customers ("Customer" or “Customers”) with retail partners ("Retailer” or “Retailers”) through curated product recommendations tailored to the Customer potential needs.`,
  },
  {
    heading: '3. REGISTRATION OBLIGATIONS',
    body: `To use certain areas of this App (regardless if you are a Customer or a Retailer), you must first complete the registration process to create an account (“Account”) and select and register a unique user name and password (collectively, “Credentials”). Your Account and Credentials are specific to you and may not be shared with or transferred to any other person. You are solely responsible for maintaining the confidentiality of your Credentials and you will be held responsible for any harm caused by disclosing or resulting from any unauthorized use of your Credentials. You will not permit any other person to use your Account or Credentials, and you will immediately notify Company if you know or suspect that your Account or Credentials have been used by any other person.\n\nDuring the registration process, you will provide true, accurate, current and complete information about yourself as prompted by the Service's registration form (such information being the “Registration Data”). You will also maintain and promptly update the Registration Data to keep it true, accurate, current and complete. If you provide any information that is untrue, inaccurate, not current or complete, or Company has reasonable grounds to suspect that such information is untrue, inaccurate, not current or complete, Company has the right to suspend or terminate your account and refuse any and all current or future use of the Service (or any portion thereof) by you. Individuals under 18 years of age cannot register on any portion of this App.\n\nCompany may act upon any communication that is given through your Account or by using your Credentials. Company is not required to verify the actual identity or authority of a person using your Account or Credentials, but Company may in its discretion at any time require verification of the identity of a person seeking to access your Account and may deny access to and use of your Account if Company is not satisfied with the verification. If Company, in its discretion, considers your Account or Credentials to be unsecure or to have been used inappropriately, then Company may immediately cancel the Account or Credentials without any notice to you. You may be required to change your Credentials from time to time.`,
  },
  {
    heading: '4. DESCRIPTION OF SERVICES',
    body: `Company is offering to persons who have Accounts an AI-powered digital home organization application that analyzes uploaded photos of a Customer's interior spaces to provide personalized, room-specific space-saving and organization recommendations, while also connecting Customers with Retailers through curated product suggestions to assist Customers implement and purchase organisational solutions for their interior spaces (the “Services”). The provision of the Services is subject to these Terms, the Services subscription or other terms you accepted when purchasing the Services.`,
  },
  {
    heading: '5. PRIVACY POLICY',
    body: `Your Credentials, Registration Data and any other information that you provide to us through this App, as well as certain other information about you, is subject to Company's Privacy Policy (see below). Your privacy is important to us. For more information, please see our Privacy Policy below for details.`,
  },
  {
    heading: '6. USE OF THE APP',
    body: `Company authorizes you to view, download and print a single copy of materials and content provided on this App for your personal, non-commercial use only and only in connection with your registering with Company or using the Services. You may not remove any trade-mark, copyright or other proprietary notices from such copy nor modify the material or content in any way. Except as otherwise set out in these Terms, any copying or reproduction of this App's materials or content, in whole or in part, for commercial purposes or distribution, re-transmission, republication, modification, reverse engineering, sale or other exploitation of this App or this App materials or content without the prior written permission of Company is strictly prohibited. Company reserves the right to take such steps as it deems necessary, including legal action, to restrain such unauthorized and prohibited activity and Company reserves the right to suspend or terminate your access to any part of this App or the Services immediately, without prior notice, at its sole discretion. You are solely and fully responsible for all consequences, however remote, resulting from your use of this App or the Services.`,
  },
  {
    heading: '7. TRADE-MARKS, COPYRIGHT, AND INTELLECTUAL PROPERTY',
    body: `“${APP_NAME}”, [Insert Company name, this App domain and other trade names or trade-marks of Company used on this App — NEEDS REVIEW], and related words and logos are trade-marks or trade-names of Company in Canada and other jurisdictions. Company is also the owner in Canada as well as other foreign jurisdictions of additional trade-marks, registered and unregistered. Nothing in these Terms or on this App will be construed as granting or conferring, either expressly, by implication, by estoppel or otherwise, a licence or other right to you to use any such marks or names or any other intellectual property right of Company. The names of other companies, products and services referred to on this App may be trade-marks or trade-names of their respective owners. Any unauthorized use of the trade-marks or trade-names of Company or of third parties is strictly prohibited.\n\nAll intellectual property rights in and to the application, including but not limited to its software, algorithms, designs, features, functionality, text, graphics, logos, trademarks, and any analysis, recommendations, outputs, or derivative works generated by the application (collectively, the “Company IP”), are and shall remain the sole and exclusive property of the Company. All rights reserved. Title to the Company materials remains with Company and any unauthorized use of such materials is strictly prohibited. Company reserves the right to take such steps as it deems necessary, including legal action, to enforce its rights under trade-mark and copyright law.\n\nBy uploading, submitting, or otherwise providing any images, photographs, documents, or other content to the application (“User Content”), the Customer acknowledges and agrees that all rights, title, and interest in and to such User Content shall vest in the Company upon upload, to the fullest extent permitted by law. To the extent that ownership does not automatically vest, the Customer hereby irrevocably assigns to the Company all intellectual property rights in such User Content, including any copyrights and related rights.\n\nThe Company may use, reproduce, modify, analyze, adapt, publish, display, distribute, and create derivative works from User Content for any lawful purpose, including but not limited to providing and improving the application, developing new products or services, analytics, research, marketing, and partnerships with retail providers. The Customer waives any moral rights or similar rights in relation to the User Content to the extent permitted by applicable law.\n\nCustomers retain no ownership, license, or other rights in the Company IP or in any outputs generated by the application, except for the limited right to access and use the application in accordance with these Terms and Conditions.`,
  },
  {
    heading: '8. USER GENERATED CONTENT',
    body: `Portions of this App allow Customers to post and exchange information, ideas and opinions (“User Content”), but Company does not screen, edit or review any User Content before they are posted or transmitted. Please note that posted or transmitted User Content do not necessarily reflect the views of Company, and Company disclaims all responsibility for any such User Content and for any losses or expenses resulting from their use or appearance on this App.\n\nWe value your visit to this App and welcome any questions, comments or feedback you might have about this App, these Terms or any of the products or services offered by Company (“Feedback”). Please refer to the Contact section of this App for phone and fax numbers and email addresses.\n\nIf you provide User Content or Feedback, you grant Company a non-exclusive, royalty-free, perpetual, irrevocable, and fully sub-licensable right to use and commercialize the feedback in any way and for any purpose without providing any compensation to you or any other person. You also grant Company the right to use the name you submit with the User Content or Feedback, if any, in connection with Company's rights hereunder.`,
  },
  {
    heading: '9. HYPERLINKS',
    body: `Hyperlinks on this App are provided for your convenience only. These links do not imply an endorsement of any linked sites or an affiliation with their owners or operators. Company has no control over the content of any linked site. This content is the sole responsibility of the owner or operator of the linked site.`,
  },
  {
    heading: '10. ACCEPTABLE USE AND RESTRICTIONS',
    body: `In addition to complying with these Terms, you agree to use this App, the Services and materials on this App for lawful purposes only and in a manner consistent with local, national or international laws and regulations. Some jurisdictions may have restrictions on the use of the Internet by their residents.\n\nPotential users of this App or the Services, in any jurisdiction of the world whose laws would: (i) void these Terms in whole or in any essential part (the essential parts being at least, but not only, the provisions relating to governing law, and limitation of liability); or (ii) render accessing this App illegal; are unauthorized to use this App.\n\nYou agree not to use the Services or this App in any manner that: (i) infringes, violates or misappropriates the intellectual property rights of any third party; or (ii) may be considered defamatory, discriminatory or otherwise malicious or harmful to any person or entity.`,
  },
  {
    heading: '11. INDEMNITY',
    body: `You will defend, indemnify and hold harmless Company its officers, directors, employees, and agents (each a “Indemnitee”) from and against any and all losses, damages, costs, expenses (including legal fees), claims, complaints, demands, actions, suits, proceedings, obligations and liabilities (including settlement payments) arising from, connected with or relating to your use of this App, its content or materials, or the Services, User Content or Feedback, or your negligence, misconduct, or breach of these Terms. For greater certainty, without limiting the foregoing, your negligence includes negligence causing property damage and/or personal injury. Notwithstanding the foregoing, Company retains the right to participate in the defense of and settlement negotiations relating to any third party claim, complaint, demand, action, suit or proceeding with counsel of its own selection at its cost and expense.`,
  },
  {
    heading: '12. DISCLAIMERS',
    body: `You understand and agree that:\n\na. Use of this App and the Services is at your sole risk. This App and the Services are provided on an “as is”, “as available” basis. Neither Company, its parent, subsidiaries, affiliates, nor any of their respective employees, agents, officers, directors or third party service providers (collectively, “Company Parties”) make any warranty or condition of any kind, whether express or implied, regarding this App or the Services and Company Parties specifically disclaim the implied warranties and conditions of merchantable quality, fitness for a particular purpose and non-infringement of third party rights, to the maximum extent permitted by law.\n\nb. Retailers are independent contractors. This App, Terms, or the Service does not create a partnership, franchise, joint venture, agency, fiduciary, or employment relationship between the Retailer and the Company Parties.\n\nc. The Company Parties do not conduct background checks, identity verification, criminal record checks, licensing verification, or screening of any kind on Customers or Retailers. All Retailers operate as independent service providers, and all Customers and Retailers are solely responsible for ensuring that they comply with applicable laws, regulations, licensing requirements, and safety standards.\n\nd. The Company Parties make no representations, warranties, or guarantees regarding the identity, qualifications, reliability, or suitability of any Customer or Retailer, or Retailer products. You acknowledge and agree that they engage with other users at their own risk and are responsible for exercising their own judgment and due diligence before accepting or performing any job.\n\ne. Company Parties make no warranties or conditions regarding the quality, reliability, timeliness or security of any service or products provided by a Retailer to a Customer. Company Parties assume no responsibility or liability for any service or product provided by a Retailer.\n\nf. Company Parties make no warranties or conditions regarding the quality, reliability, timeliness or security of the Services or that the Services will be uninterrupted or error-free. Company Parties assume no responsibility or liability for the deletion or failure to store or access, or to store or access properly, email messages and electronic files. You assume the entire risk in downloading or otherwise accessing any data, files or other materials obtained from third parties as part of the Services, even if you have paid for virus protection services.\n\ng. The access to and downloading of material from this App is done at your own risk. Company makes reasonable efforts to ensure that this App is virus-free, but Company does not at any time guarantee or warrant that such materials are free of viruses, worms, Trojan horses or other destructive code. You are responsible for implementing safeguards to protect your computer system and data and you are responsible for the entire cost of any service, repairs or corrections necessary as a result of the use of this App or the Services.`,
  },
  {
    heading: '13. LIMITATIONS OF LIABILITY',
    body: `In no event will Company Parties be liable to you for any direct, indirect, consequential, incidental, special, compensatory or punitive damages or losses or damages for loss of income, loss of business profits, business interruption, loss of data or business information, loss of or damage to property and claims of third parties or other pecuniary loss, arising out of or related to these Terms, the use of this App or the Services. Company Parties will not be liable for any actual or alleged infringement by any third party materials available through the App or the Services. In no event will the cumulative liability of Company Parties arising out of or related to these Terms exceed the amount paid by you in the one month immediately prior to any claim. To the extent that some jurisdictions do not allow exclusions or limitations on some categories of damages, these exclusions or limitations may not apply to you.\n\nThe foregoing disclaimers and limitations of liability apply regardless of the causes, circumstances or form of action giving rise to the loss, damage, claim or liability, even if such loss, damage, claim or liability is based upon breach of contract (including, without limitation, a claim of fundamental breach or breach of a fundamental term), tort (including, without limitation, negligence), strict liability or any other legal or equitable theory, and even if advised of the possibility of the loss, damage, delay, claim or liability.\n\nYou acknowledge and agree that these Terms present a fair allocation of risk and liability, and that this Section 13 is an essential part of the bargain between the Parties, a controlling factor in setting any fees or other charges, and an inducement to the Parties to enter into these Terms.`,
  },
  {
    heading: '14. GENERAL',
    body: `These Terms, the Privacy Policy and all other notices, policies and statements contained on this App (all as may be amended by Company from time to time without prior notice) constitute the entire agreement between Company and you. These Terms cannot be modified except as described herein. Anything in this App inconsistent with these Terms is superseded by these Terms. No waiver of any of these Terms will be deemed a further or continuing waiver of such Term or any other Term. If in any jurisdiction, any of these Terms are held to be unenforceable by a court of competent jurisdiction, such Terms will be restricted or eliminated to the minimum extent necessary and the remaining Terms will otherwise remain in full force and effect. The headings used in these Terms are included for convenience only and will not limit or otherwise affect these Terms.\n\nThe relationship between Company and you will be that of independent contractors, and neither of us nor any of our respective officers, agents or employees will be held or construed to be partners, joint ventures, fiduciaries, employees or agents of the other as a result of these Terms or this App.\n\nThese Terms and the subject matter of these Terms and all related matters will be governed by, and construed in accordance with, the laws of the Province of Saskatchewan, Canada and the laws of Canada applicable in Saskatchewan, excluding any laws that implement the United Nations Convention on Contracts for the International Sale of Goods or the United States Uniform Commercial Code, and excluding any rules of private international law or the conflict of laws that would lead to the application of any other laws. Subject to the following paragraph, you submit to the exclusive jurisdiction of the courts of the Province of Saskatchewan.\n\nTo the extent permitted by applicable law, unless Company agrees otherwise, any claim, dispute or controversy, whether in contract or tort, pursuant to statute or regulation, or otherwise, and whether pre-existing, present or future, arising out of or relating to the Services, this App, these Terms or the Privacy Policy, will be determined by final and binding arbitration to the exclusion of the courts. Where applicable, arbitration will be conducted in the province in which you reside, on a simplified and expedited basis by one arbitrator pursuant to the current laws and rules relating to commercial arbitration in the province or jurisdiction in which you reside on the date of the notice. The foregoing does not, however, preclude Company from seeking injunctive relief in other jurisdictions when necessary to protect its interests. You agree that any dispute resolution proceedings will be conducted only on an individual basis and not in a class, consolidated or representative action. If for any reason a Claim proceeds in court rather than in arbitration, you waive any right to a jury trial.\n\nThese Terms have been drawn up in the English language at the express request of the parties. Les présentes modalités ont été rédigées en anglais à la demande expresse des parties.`,
  },
  {
    heading: '15. CONTACT US',
    body: `We value your visit to this App and welcome any questions or comments you might have about this App, these Terms, or any of the products or services offered by Company. Please refer to the Contact section of this App for phone, email addresses and other ways to contact us.`,
  },
];

const PRIVACY_SECTIONS = [
  {
    heading: 'CORPORATE PRIVACY POLICY',
    body: `“${APP_NAME}” (the “Company”) respects your privacy. This “Privacy Policy” summarizes what personal information we collect, how we use and disclose this information, and where that information is process, stored, and maintained.\n\nBy using our digital home organization application (the “App”), you signify your consent to the terms of our Privacy Policy. If you do not agree with any terms of this Privacy Policy, please do not use this App or submit any personal information to us.\n\nWe reserve the right to modify this Privacy Policy at any time. We will reflect any such modifications to this Privacy Policy on our App. Your continued use of the App after any such changes constitutes your acceptance of this Privacy Policy, as revised.`,
  },
  {
    heading: 'What Personal Information We Collect',
    body: `Personal information is information about an identifiable individual (“Personal Information”). Company collects Personal Information when you voluntarily provide it through our App, or when you provide it to us through other means. For example, we may collect Personal Information when you:\n\n• Contact us through email, telephone, mail, or other correspondence;\n• Register for a service we provide; or\n• Register to receive our newsletter.\n\nThe Personal Information we may collect will depend on the service you request, and may include your full name, contact information, such as your address, telephone number, or email address; information relating to the interior of your personal residence or interior spaces; any other Personal Information that you choose to submit to us.`,
  },
  {
    heading: 'How Company Collects Information Through Technological Means',
    body: `When you visit our App, we may collect information that is automatically sent to us by your web browser. This information may include your domain name, and your numerical IP address. We may also collect other information, such as the type of browser you use, which pages you view, and the files you request.\n\nWe use this information to better understand how visitors use our App, and to improve our App to better meet your needs. The amount of information that is sent by your web browser depends on the browser and settings you use. Please refer to the instructions provided by your browser if you want to learn more about what information it sends to websites you visit, or how you may change or restrict this.\n\nCompany may use “cookies” and other similar devices on this App to enhance functionality. These devices may track information which includes, but is not limited to: (i) IP address; (ii) the type of web browser and operating system used; and (iii) the pages of the App visited. If you wish to disable cookies, refer to your browser help menu to learn how. If you disable cookies, you may be unable to access some features on this App.`,
  },
  {
    heading: 'How Company Uses and Discloses Personal Information',
    body: `The Personal Information we collect may be used by Company for the purposes for which it was collected, as provided in this Privacy Policy, or for other purposes that are disclosed to you and to which you consent.\n\nFor example, we may use your Personal Information to: respond to your inquiries; supply you with requested products or services; send you informational or promotional communications; to carry out other purposes that are disclosed to you and to which you consent; to carry out any other purpose permitted or required by law. We may transfer Personal Information to third party service providers that assist us with carrying out these purposes.\n\nSome or all of the personal information we collect may be stored or processed outside Canada, including but not limited to the United States, and European countries. As a result, this information may be subject to access requests from governments, courts, or law enforcement in those jurisdictions according to laws in those jurisdictions.\n\nCompany reserves the right to transfer Personal Information in the event that we merge with or are acquired by a third party. We also may disclose your Personal Information for any other purpose permitted by law or to which you consent.`,
  },
  {
    heading: 'How We Protect Personal Information',
    body: `The security of your Personal Information is important to us. We protect your Personal Information by maintaining physical, organizational and technological safeguards appropriate to the sensitivity of such Personal Information. Personal Information may only be accessed by persons within our organization who require such access to provide you with the services indicated above. Although the Personal Information we collect is maintained in Canada, we cannot guarantee that the Personal Information will not be processed or stored inside Canada.\n\nWe retain Personal Information that we collect only as long as necessary for the purposes for which it was collected or to meet legal requirements. We destroy Personal Information when it is no longer needed.`,
  },
  {
    heading: 'Access and Rectification',
    body: `You have a right to access to your Personal Information and to request a correction to it if you believe it is inaccurate. If you have submitted Personal Information and would like to have access to it, or if you would like to have it corrected, please contact us using the contact information provided below.`,
  },
  {
    heading: 'How to Contact Us',
    body: `If you have any questions regarding this Privacy Policy, or to access your information, please contact our Privacy Officer at ${PRIVACY_OFFICER_CONTACT}`,
  },
];

function LegalSection({ heading, body }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>{heading}</Text>
      <Text style={styles.sectionBody}>{body}</Text>
    </View>
  );
}

export default function LiabilityScreen({ onAccept }) {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Icon name="clipboard" size={48} color={Colors.icon} style={styles.emoji} />
          <Text style={styles.title}>Terms of Use & Privacy Policy</Text>
          <Text style={styles.subtitle}>Please read and accept before continuing.</Text>
        </View>

        <View style={styles.letter}>
          {TERMS_SECTIONS.map((s, i) => (
            <LegalSection key={`terms-${i}`} heading={s.heading} body={s.body} />
          ))}

          <View style={styles.divider} />

          {PRIVACY_SECTIONS.map((s, i) => (
            <LegalSection key={`privacy-${i}`} heading={s.heading} body={s.body} />
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button title="I Agree, Continue" onPress={onAccept} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  scrollContent: {
    padding: 30,
    paddingBottom: 120,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  emoji: {
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontFamily: Fonts.headingBold,
    color: Colors.accent,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  letter: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 20,
    padding: 24,
  },
  section: {
    marginBottom: 18,
  },
  sectionHeading: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.accent,
    marginBottom: 6,
  },
  sectionBody: {
    fontSize: 13.5,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 10,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
