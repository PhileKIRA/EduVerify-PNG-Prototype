import React from "react";
import { C, MONO } from "./theme.js";
import { Card, SectionTitle, Badge } from "./components/ui.jsx";
function VerifyView({ token, records, tokens, setChecks, log }) {

  const tokenData = tokens.find(
    (t) => t.token === token
  );

  if (!tokenData) {
    return (
      <Card>
        <h2 style={{color:C.red}}>
          Invalid QR Code
        </h2>
        <p>
          This credential link is not valid.
        </p>
      </Card>
    );
  }


  const record = records.find(
    (r)=>r.id === tokenData.recordId
  );


  if (!record) {
    return (
      <Card>
        Record not found.
      </Card>
    );
  }


  return (
    <div>

      <SectionTitle>
        EduVerify PNG Credential Verification
      </SectionTitle>


      <Card>

        <h2 className="font-bold text-lg">
          Verified Credential
        </h2>


        <p>
          <b>Student:</b>{" "}
          {record.structured.studentId}
        </p>


        <p>
          <b>Institution:</b>{" "}
          {record.structured.institution}
        </p>


        <p>
          <b>Program:</b>{" "}
          {record.structured.program}
        </p>


        <p>
          <b>Graduation:</b>{" "}
          {record.structured.graduationStatus}
        </p>


        <p>
          <b>Year:</b>{" "}
          {record.structured.completionYear}
        </p>


        <Badge status="verified"/>


        <p
        style={{
          fontFamily:MONO,
          fontSize:"12px",
          marginTop:"20px"
        }}>
          SHA-256:
          <br/>
          {record.hash}
        </p>


      </Card>

    </div>
  );
}


export default VerifyView;